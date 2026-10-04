/**
 * The four things worth saying about a repository, all of them arithmetic over
 * the file list and the edge list. No model is asked anything, and nothing
 * here reads a file's contents: a fact about the graph is derived from the
 * graph.
 *
 * A file nothing imports is not automatically an orphan. Pages, routes,
 * layouts, middleware and config are reached by the framework, so the parser's
 * entry points are taken out of that list before it is shown. Reporting them
 * as unused would be the parser describing the edge of its own view as a
 * finding about the code.
 */

import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { FileCategory } from "./types.ts";

export type InsightKind = "unimported" | "concentrated" | "cycle" | "long";

/** The fixed order, and it leads with the explanatory one. Cycles and
 *  oversized files read closer to a verdict, so they go underneath. */
export const INSIGHT_ORDER: readonly InsightKind[] = [
  "unimported",
  "concentrated",
  "cycle",
  "long",
];

/** One of four fixed sentences. Nothing personalises these, by design. */
export const INSIGHT_SENTENCE: Record<InsightKind, string> = {
  unimported: "Nothing in the repository imports these.",
  concentrated: "These are imported far more than everything else.",
  cycle: "These files are part of an import cycle.",
  long: "These files are very long.",
};

export const INSIGHT_TITLE: Record<InsightKind, string> = {
  unimported: "nothing imports",
  concentrated: "unusually depended on",
  cycle: "import cycles",
  long: "very long files",
};

/** An outlier is a file more than this many standard deviations above the
 *  mean fan-in. Fan-in is long-tailed, so the mean alone would name nothing. */
const UNUSUAL_FAN_IN_SIGMA = 2;

/** Being imported once more than average is not unusual. This floor keeps the
 *  rule quiet in a repository where every fan-in is small. */
const UNUSUAL_FAN_IN_FLOOR = 3;

/** "Simply too long" is a fixed line, not a relative one: the reader is the
 *  same size in every repository. */
const LONG_FILE_LINES = 500;

/** How many entries an insight shows before it says how many more there are. */
export const INSIGHT_LIMIT = 25;

export interface InsightFile {
  path: string;
  category: FileCategory;
  /** A figure shown beside the path. The sentence stays fixed. */
  note?: string;
}

export interface Insight {
  kind: InsightKind;
  title: string;
  /** One of the four fixed sentences. */
  sentence: string;
  /** The files named, capped at the limit. */
  files: InsightFile[];
  /** How many matched in total, which may exceed `files.length`. */
  total: number;
}

function byPath(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function entry(path: string, note?: string): InsightFile {
  return note === undefined
    ? { path, category: categoryOf(path) }
    : { path, category: categoryOf(path), note };
}

function fanInCounts(
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
): Map<string, number> {
  const counts = new Map<string, number>(files.map((file) => [file.path, 0]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    // An edge to a file the walk skipped names nothing in the repository.
    if (!counts.has(edge.to)) continue;
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

/** The files in any strongly connected component bigger than one, which is
 *  exactly the set of files on a cycle. Kosaraju, iterative: a real repository
 *  blows a recursive call stack. */
function filesOnCycles(
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
): string[] {
  const nodes = new Set(files.map((file) => file.path));
  const forward = new Map<string, string[]>(files.map((file) => [file.path, []]));
  const backward = new Map<string, string[]>(files.map((file) => [file.path, []]));

  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    forward.get(edge.from)?.push(edge.to);
    backward.get(edge.to)?.push(edge.from);
  }

  const order: string[] = [];
  const seen = new Set<string>();
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const stack: { path: string; index: number }[] = [{ path: start, index: 0 }];
    seen.add(start);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = forward.get(frame.path) ?? [];
      if (frame.index >= neighbours.length) {
        order.push(frame.path);
        stack.pop();
        continue;
      }
      const next = neighbours[frame.index];
      frame.index += 1;
      if (next !== undefined && !seen.has(next)) {
        seen.add(next);
        stack.push({ path: next, index: 0 });
      }
    }
  }

  const component = new Map<string, number>();
  const sizes: number[] = [];
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const start = order[index];
    if (start === undefined || component.has(start)) continue;
    const id = sizes.length;
    const stack = [start];
    let size = 0;
    component.set(start, id);
    while (stack.length > 0) {
      const path = stack.pop();
      if (path === undefined) continue;
      size += 1;
      for (const neighbour of backward.get(path) ?? []) {
        if (!component.has(neighbour)) {
          component.set(neighbour, id);
          stack.push(neighbour);
        }
      }
    }
    sizes.push(size);
  }

  const cyclic = new Set<number>();
  sizes.forEach((size, id) => {
    if (size > 1) cyclic.add(id);
  });

  return [...component.entries()]
    .filter(([, id]) => cyclic.has(id))
    .map(([path]) => path)
    .sort(byPath);
}

/** Every insight, in the fixed order, whether or not it found anything. */
export function analyse(
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
  entryPoints: readonly string[],
  limit: number = INSIGHT_LIMIT,
): Insight[] {
  const counts = fanInCounts(files, edges);
  const reached = new Set(entryPoints);

  const unimported = files
    .filter((file) => (counts.get(file.path) ?? 0) === 0 && !reached.has(file.path))
    .map((file) => file.path)
    .sort(byPath);

  const values = [...counts.values()];
  const mean = values.length === 0 ? 0 : values.reduce((total, n) => total + n, 0) / values.length;
  const variance =
    values.length === 0
      ? 0
      : values.reduce((total, n) => total + (n - mean) ** 2, 0) / values.length;
  const outlier = mean + UNUSUAL_FAN_IN_SIGMA * Math.sqrt(variance);

  const concentrated = [...counts.entries()]
    .filter(([, count]) => count > outlier && count >= UNUSUAL_FAN_IN_FLOOR)
    .sort(([leftPath, leftCount], [rightPath, rightCount]) =>
      rightCount === leftCount ? byPath(leftPath, rightPath) : rightCount - leftCount,
    );

  const cycles = filesOnCycles(files, edges);

  const long = files
    .filter((file) => file.lines > LONG_FILE_LINES)
    .sort((left, right) =>
      right.lines === left.lines ? byPath(left.path, right.path) : right.lines - left.lines,
    );

  const build = (kind: InsightKind, all: readonly InsightFile[]): Insight => ({
    kind,
    title: INSIGHT_TITLE[kind],
    sentence: INSIGHT_SENTENCE[kind],
    files: all.slice(0, limit),
    total: all.length,
  });

  return [
    build("unimported", unimported.map((path) => entry(path))),
    build("concentrated", concentrated.map(([path, count]) => entry(path, `${count}`))),
    build("cycle", cycles.map((path) => entry(path))),
    build("long", long.map((file) => entry(file.path, `${file.lines} lines`))),
  ];
}
