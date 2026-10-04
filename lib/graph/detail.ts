/**
 * What the detail pane reads out of the parser's output.
 *
 * Pure functions over a file list and an edge list, like everything else the
 * map is drawn from, so the pane and the picture can never disagree. The
 * counts it shows are the lengths of the lists printed underneath them rather
 * than the parser's own fan-in fields: a number and its rows are then one
 * fact, read twice.
 */

import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { FileCategory } from "./types.ts";

/** How many files the resting pane names as the ones others lean on. */
export const LEAN_LIMIT = 10;

/** A file as one of the pane's lists names it. */
export interface FileRef {
  path: string;
  category: FileCategory;
}

export interface RankedFile extends FileRef {
  fanIn: number;
}

/** Everything the pane shows about the selected file. */
export interface FileDetail {
  path: string;
  category: FileCategory;
  lines: number;
  /** What it imports, in path order. */
  dependsOn: string[];
  /** What imports it, in path order. */
  dependents: string[];
}

/** What the pane shows with nothing selected. */
export interface Overview {
  /** Ordered by how many things import it, most first. */
  lean: RankedFile[];
  /** Everything nothing imports, in path order: where reading starts. Files
   *  the framework reaches are not here, because the import graph was never
   *  going to show them. */
  unimported: FileRef[];
}

function byPath(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function fileRef(path: string): FileRef {
  return { path, category: categoryOf(path) };
}

export function fileDetail(
  path: string,
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
): FileDetail | null {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) return null;

  const dependsOn = new Set<string>();
  const dependents = new Set<string>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    if (edge.from === path) dependsOn.add(edge.to);
    else if (edge.to === path) dependents.add(edge.from);
  }

  return {
    path: file.path,
    category: categoryOf(file.path),
    lines: file.lines,
    dependsOn: [...dependsOn].sort(byPath),
    dependents: [...dependents].sort(byPath),
  };
}

export function overview(
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
  entryPoints: readonly string[],
  limit: number = LEAN_LIMIT,
): Overview {
  const fanIn = new Map<string, number>();
  for (const file of files) fanIn.set(file.path, 0);
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    // An edge to a file the walk skipped names nothing on the canvas, so it
    // cannot count towards anything the pane lists either.
    if (!fanIn.has(edge.to)) continue;
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  const entries = [...fanIn.entries()];
  const reached = new Set(entryPoints);

  const lean = entries
    .filter(([, count]) => count > 0)
    .sort(([leftPath, leftCount], [rightPath, rightCount]) =>
      rightCount === leftCount ? byPath(leftPath, rightPath) : rightCount - leftCount,
    )
    .slice(0, limit)
    .map(([path, count]) => ({ ...fileRef(path), fanIn: count }));

  const unimported = entries
    .filter(([path, count]) => count === 0 && !reached.has(path))
    .map(([path]) => path)
    .sort(byPath)
    .map(fileRef);

  return { lean, unimported };
}
