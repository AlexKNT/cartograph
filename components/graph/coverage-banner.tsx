"use client";

import { useState } from "react";
import { graphCoverage, type CoverageCounts } from "@/lib/graph/coverage";

/**
 * What the map is missing, said out loud and never quietly.
 *
 * Amber is the palette's warning end. The direction colours only ever paint
 * edges, so a line of text cannot be read as one.
 *
 * Collapsing keeps the figure: a graph that is thirty percent complete has to
 * read as thirty percent complete in one line as well as in three.
 */
export function CoverageBanner({ counts }: { counts: CoverageCounts }) {
  const [open, setOpen] = useState(true);
  const coverage = graphCoverage(counts);

  if (!coverage.partial) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-baseline gap-1.5 border-b border-border bg-surface px-2 py-1 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={open ? "Collapse the coverage notice" : "Expand the coverage notice"}
        className="font-mono text-muted hover:text-foreground"
      >
        {open ? "▾" : "▸"}
      </button>

      <span className="text-outgoing">partial graph</span>

      <span className="font-mono">
        {coverage.covered} of {coverage.expected} imports mapped ({coverage.percent}%)
      </span>

      {open && (
        <span className="text-muted">
          ·{" "}
          {[
            counts.unresolved > 0 ? `${counts.unresolved} resolved to nothing` : null,
            counts.pruned > 0 ? `${counts.pruned} into folders that were not parsed` : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </span>
      )}
    </div>
  );
}
