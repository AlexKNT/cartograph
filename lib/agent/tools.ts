/**
 * The six questions the agent may ask the graph.
 *
 * Every answer here is arithmetic over the parser's own file list and edge list,
 * through the very functions the canvas and the pane are drawn from — the walk
 * is `transitiveWalk`, the neighbours are `fileDetail`, the fold is `foldFiles`.
 * Nothing in this file reads a file's contents or decides that two files are
 * connected, which is what keeps an agent's answer and the map from disagreeing.
 *
 * Pure: no database, no framework, no client. The read-only surface hands it an
 * analysis and turns its answer into JSON.
 */

import { graphCoverage, type CoverageCounts } from "../graph/coverage.ts";
import { fileDetail } from "../graph/detail.ts";
import { foldFiles } from "../graph/fold.ts";
import { analyse } from "../graph/insights.ts";
import { categoryIndex, railCounts, railFor } from "../graph/rail.ts";
import { transitiveWalk, WALK_DEPTH, type WalkDirection } from "../graph/traverse.ts";
import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import type { StoredRoute } from "../supabase/types.ts";

/** The names the agent's tools call. Anything else is refused. */
export const AGENT_TOOLS = [
  "summary",
  "find_files",
  "files_by_role",
  "file_neighbours",
  "walk",
  "routes",
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export function isAgentTool(value: unknown): value is AgentTool {
  return typeof value === "string" && (AGENT_TOOLS as readonly string[]).includes(value);
}

/** Everything the tools read, which is everything the map was drawn from. */
export interface AnalysisFacts {
  repository: string;
  framework: string;
  files: readonly ParsedFile[];
  edges: readonly ImportEdge[];
  roles: Readonly<Record<string, string>>;
  routes: readonly StoredRoute[];
  coverage: CoverageCounts;
}

export interface FileLine {
  path: string;
  role: string | null;
  lines: number;
  fanIn: number;
  fanOut: number;
}

export interface NeighbourLine {
  path: string;
  kinds: string[];
}

export interface SummaryOutput {
  repository: string;
  framework: string;
  files: number;
  nodes: number;
  edges: number;
  imports: { seen: number; resolved: number; unresolved: number; pruned: number };
  coverage: { percent: number; partial: boolean };
  categories: { role: string; label: string; count: number }[];
  insights: {
    kind: string;
    title: string;
    sentence: string;
    total: number;
    files: { path: string; note?: string }[];
  }[];
}

export interface FindFilesOutput {
  contains: string;
  matches: FileLine[];
  total: number;
}

export interface RoleOutput {
  role: string;
  label: string;
  files: string[];
  total: number;
}

export interface NeighboursOutput {
  path: string;
  role: string | null;
  lines: number;
  imports: NeighbourLine[];
  importers: NeighbourLine[];
}

export interface WalkOutput {
  path: string;
  direction: WalkDirection;
  depth: number;
  files: { path: string; depth: number }[];
}

export interface RoutesOutput {
  routes: { method: string | null; route: string; file: string }[];
  total: number;
}

export type ToolOutput =
  | SummaryOutput
  | FindFilesOutput
  | RoleOutput
  | NeighboursOutput
  | WalkOutput
  | RoutesOutput;

/** Found, or refused with a reason the agent can repeat to the person. */
export type ToolOutcome =
  | { kind: "found"; value: ToolOutput }
  | { kind: "refused"; message: string };

/** How many matches a search returns before it says how many it did not. */
const SEARCH_LIMIT = 25;

/** Deeper than this returns most of a real repository, which is not an answer. */
const WALK_LIMIT = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value;
}

function byPath(left: string, right: string): number {
  return left < right ? -1 : 1;
}

/** The parser's own kinds for one direction of a pair, or none when unconnected. */
function kindsBetween(edges: readonly ImportEdge[], from: string, to: string): string[] {
  const kinds = new Set<string>();
  for (const edge of edges) {
    if (edge.from !== from || edge.to !== to) continue;
    for (const kind of edge.kinds) kinds.add(kind);
  }
  return [...kinds];
}

function line(path: string, facts: AnalysisFacts, index: ReturnType<typeof categoryIndex>): FileLine {
  const file = facts.files.find((candidate) => candidate.path === path);
  return {
    path,
    role: index.get(path)?.id ?? null,
    lines: file?.lines ?? 0,
    fanIn: file?.fanIn ?? 0,
    fanOut: file?.fanOut ?? 0,
  };
}

function summary(facts: AnalysisFacts, index: ReturnType<typeof categoryIndex>): SummaryOutput {
  const fold = foldFiles(facts.files, facts.edges);
  const coverage = graphCoverage(facts.coverage);

  return {
    repository: facts.repository,
    framework: facts.framework,
    files: facts.files.length,
    nodes: fold.nodes.length,
    edges: facts.edges.length,
    imports: facts.coverage,
    coverage: { percent: coverage.percent, partial: coverage.partial },
    categories: railCounts(railFor(facts.framework), index).map((entry) => ({
      role: entry.id,
      label: entry.label,
      count: entry.count,
    })),
    insights: analyse(facts.files, facts.edges, [], index).map((insight) => ({
      kind: insight.kind,
      title: insight.title,
      sentence: insight.sentence,
      total: insight.total,
      files: insight.files.map((file) =>
        file.note === undefined ? { path: file.path } : { path: file.path, note: file.note },
      ),
    })),
  };
}

function findFiles(
  input: Record<string, unknown>,
  facts: AnalysisFacts,
  index: ReturnType<typeof categoryIndex>,
): ToolOutcome {
  const contains = textField(input, "contains");
  if (contains === null) return { kind: "refused", message: "`contains` must be a non-empty piece of a path." };

  const limit = numberField(input, "limit") ?? SEARCH_LIMIT;
  if (limit < 1 || limit > 50) {
    return { kind: "refused", message: "`limit` must be between 1 and 50." };
  }

  const needle = contains.toLowerCase();
  const matched = facts.files
    .filter((file) => file.path.toLowerCase().includes(needle))
    .map((file) => file.path);

  const matches = matched
    .map((path) => line(path, facts, index))
    .sort((left, right) =>
      right.fanIn === left.fanIn ? byPath(left.path, right.path) : right.fanIn - left.fanIn,
    )
    .slice(0, limit);

  return { kind: "found", value: { contains, matches, total: matched.length } };
}

function filesByRole(
  input: Record<string, unknown>,
  facts: AnalysisFacts,
  index: ReturnType<typeof categoryIndex>,
): ToolOutcome {
  const role = textField(input, "role");
  if (role === null) return { kind: "refused", message: "`role` must be a non-empty role id." };

  const entry = railFor(facts.framework).find((candidate) => candidate.id === role);
  if (entry === undefined) {
    const known = railFor(facts.framework)
      .map((candidate) => candidate.id)
      .join(", ");
    return { kind: "refused", message: `There is no role "${role}". The roles here are: ${known}.` };
  }

  const files = [...index.entries()]
    .filter(([, entry]) => entry.id === role)
    .map(([path]) => path)
    .sort(byPath);

  return { kind: "found", value: { role, label: entry.label, files, total: files.length } };
}

function fileNeighbours(
  input: Record<string, unknown>,
  facts: AnalysisFacts,
  index: ReturnType<typeof categoryIndex>,
): ToolOutcome {
  const path = textField(input, "path");
  if (path === null) return { kind: "refused", message: "`path` must be a file path this run kept." };

  // The pane's own function, so a neighbour list here is the list on screen.
  const detail = fileDetail(path, facts.files, facts.edges, index);
  if (detail === null) {
    return { kind: "refused", message: `There is no file "${path}" in this analysis.` };
  }

  return {
    kind: "found",
    value: {
      path: detail.path,
      role: index.get(detail.path)?.id ?? null,
      lines: detail.lines,
      imports: detail.dependsOn.map((neighbour) => ({
        path: neighbour,
        kinds: kindsBetween(facts.edges, detail.path, neighbour),
      })),
      importers: detail.dependents.map((neighbour) => ({
        path: neighbour,
        kinds: kindsBetween(facts.edges, neighbour, detail.path),
      })),
    },
  };
}

function walk(
  input: Record<string, unknown>,
  facts: AnalysisFacts,
  index: ReturnType<typeof categoryIndex>,
): ToolOutcome {
  const path = textField(input, "path");
  if (path === null) return { kind: "refused", message: "`path` must be a file path this run kept." };

  const direction = textField(input, "direction");
  if (direction !== "in" && direction !== "out") {
    return { kind: "refused", message: "`direction` must be \"in\" (what depends on it) or \"out\" (what it needs)." };
  }

  if (!facts.files.some((file) => file.path === path)) {
    return { kind: "refused", message: `There is no file "${path}" in this analysis.` };
  }

  const depth = numberField(input, "depth") ?? WALK_DEPTH;
  if (depth < 1 || depth > WALK_LIMIT) {
    return { kind: "refused", message: `\`depth\` must be between 1 and ${WALK_LIMIT}.` };
  }

  const walked = transitiveWalk(path, facts.edges, index, direction, depth);
  return {
    kind: "found",
    value: {
      path,
      direction,
      depth,
      files: walked.map((file) => ({ path: file.path, depth: file.depth })),
    },
  };
}

function routes(facts: AnalysisFacts): ToolOutcome {
  const sorted = [...facts.routes].sort((left, right) => {
    if (left.route !== right.route) return left.route < right.route ? -1 : 1;
    return (left.method ?? "") < (right.method ?? "") ? -1 : 1;
  });

  return {
    kind: "found",
    value: {
      routes: sorted.map((route) => ({ method: route.method, route: route.route, file: route.file })),
      total: sorted.length,
    },
  };
}

/** One tool's answer over one analysis. Unknown input is refused, never assumed. */
export function runTool(tool: AgentTool, input: unknown, facts: AnalysisFacts): ToolOutcome {
  const index = categoryIndex(facts.framework, facts.files, new Map(Object.entries(facts.roles)));
  const record = isRecord(input) ? input : {};

  switch (tool) {
    case "summary":
      return { kind: "found", value: summary(facts, index) };
    case "find_files":
      return findFiles(record, facts, index);
    case "files_by_role":
      return filesByRole(record, facts, index);
    case "file_neighbours":
      return fileNeighbours(record, facts, index);
    case "walk":
      return walk(record, facts, index);
    case "routes":
      return routes(facts);
  }
}
