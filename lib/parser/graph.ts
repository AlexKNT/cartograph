import type {
  CoverageGroup,
  CoverageReport,
  EdgeKind,
  ImportEdge,
  ImportProblemReason,
  ParsedFile,
  SeenImport,
} from "./types.ts";

/** A file before the arithmetic has run over the edge list. */
export type FileFacts = Omit<ParsedFile, "fanIn" | "fanOut">;

const KIND_ORDER: readonly EdgeKind[] = ["import", "re-export", "dynamic-import"];

function compareEdges(left: ImportEdge, right: ImportEdge): number {
  if (left.from !== right.from) return left.from < right.from ? -1 : 1;
  if (left.to !== right.to) return left.to < right.to ? -1 : 1;
  return 0;
}

/**
 * One edge per pair of files, however many statements connect them. An import
 * and a re-export of the same file is one connection drawn once.
 */
export function buildEdges(imports: readonly SeenImport[]): ImportEdge[] {
  const pairs = new Map<string, { from: string; to: string; kinds: Set<EdgeKind> }>();

  for (const entry of imports) {
    if (entry.outcome.status !== "resolved") continue;
    const key = `${entry.from}\u0000${entry.outcome.to}`;
    const existing = pairs.get(key);
    if (existing === undefined) {
      pairs.set(key, {
        from: entry.from,
        to: entry.outcome.to,
        kinds: new Set([entry.kind]),
      });
      continue;
    }
    existing.kinds.add(entry.kind);
  }

  return [...pairs.values()]
    .map((pair) => ({
      from: pair.from,
      to: pair.to,
      kinds: KIND_ORDER.filter((kind) => pair.kinds.has(kind)),
    }))
    .sort(compareEdges);
}

export function withFanCounts(
  files: readonly FileFacts[],
  edges: readonly ImportEdge[],
): ParsedFile[] {
  const fanOut = new Map<string, number>();
  const fanIn = new Map<string, number>();

  for (const edge of edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  return files
    .map((file) => ({
      ...file,
      fanIn: fanIn.get(file.path) ?? 0,
      fanOut: fanOut.get(file.path) ?? 0,
    }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
}

function groupsFrom(
  counts: Map<ImportProblemReason, CoverageGroup>,
): CoverageGroup[] {
  return [...counts.values()].sort((left, right) =>
    right.count === left.count
      ? left.reason < right.reason
        ? -1
        : 1
      : right.count - left.count,
  );
}

function addGroup(
  counts: Map<ImportProblemReason, CoverageGroup>,
  entry: SeenImport,
  reason: ImportProblemReason,
): void {
  const existing = counts.get(reason);
  if (existing === undefined) {
    counts.set(reason, { reason, count: 1, example: entry });
    return;
  }
  existing.count += 1;
}

/** Every import seen, and how it ended. The counts and the list are one walk. */
export function summariseCoverage(imports: readonly SeenImport[]): CoverageReport {
  const external = new Map<ImportProblemReason, CoverageGroup>();
  const excluded = new Map<ImportProblemReason, CoverageGroup>();
  const unresolved = new Map<ImportProblemReason, CoverageGroup>();

  const report: CoverageReport = {
    seen: imports.length,
    resolved: 0,
    external: 0,
    excluded: 0,
    unresolved: 0,
    externalByReason: [],
    excludedByReason: [],
    unresolvedByReason: [],
  };

  for (const entry of imports) {
    switch (entry.outcome.status) {
      case "resolved":
        report.resolved += 1;
        break;
      case "external":
        report.external += 1;
        addGroup(external, entry, entry.outcome.reason);
        break;
      case "excluded":
        report.excluded += 1;
        addGroup(excluded, entry, entry.outcome.reason);
        break;
      case "unresolved":
        report.unresolved += 1;
        addGroup(unresolved, entry, entry.outcome.reason);
        break;
    }
  }

  report.externalByReason = groupsFrom(external);
  report.excludedByReason = groupsFrom(excluded);
  report.unresolvedByReason = groupsFrom(unresolved);
  return report;
}
