/**
 * How much of the graph the parser actually managed to draw.
 *
 * Arithmetic over counts the run stored, so the banner and the number it names
 * are the same everywhere, and the answer is available the moment the row is.
 */

import type { CoverageReport, ImportProblemReason } from "../parser/types.ts";

/** What a run records about the imports it saw. Mirrors the columns on `analyses`. */
export interface CoverageCounts {
  /** Every import, re-export, literal dynamic import and `require()` seen. */
  seen: number;
  /** The ones that became edges. */
  resolved: number;
  /** The ones that matched nothing on disk, so no edge could be proved. */
  unresolved: number;
  /** The ones whose target is a file the walk did not take as a node. */
  pruned: number;
}

/**
 * Two of the parser's exclusion reasons are holes in the map, and the rest are
 * not. An import of a package, a Node built-in, or a stylesheet was never going
 * to be an edge, so counting it as missing would put every repository below a
 * hundred percent and make the figure mean nothing.
 */
const PRUNED_REASONS: readonly ImportProblemReason[] = ["ignored-directory", "skipped-file"];

export function coverageCounts(report: CoverageReport): CoverageCounts {
  const pruned = report.excludedByReason
    .filter((group) => PRUNED_REASONS.includes(group.reason))
    .reduce((total, group) => total + group.count, 0);

  return {
    seen: report.seen,
    resolved: report.resolved,
    unresolved: report.unresolved,
    pruned,
  };
}

export interface GraphCoverage {
  covered: number;
  /** Imports that belonged to this repository and should have become an edge. */
  expected: number;
  /** Never rounded up: a partial graph must not be able to read as complete. */
  percent: number;
  partial: boolean;
}

export function graphCoverage(counts: CoverageCounts): GraphCoverage {
  const expected = counts.resolved + counts.unresolved + counts.pruned;
  const percent =
    expected === 0 ? 100 : Math.floor((counts.resolved / expected) * 1000) / 10;

  return {
    covered: counts.resolved,
    expected,
    percent,
    partial: counts.resolved < expected,
  };
}
