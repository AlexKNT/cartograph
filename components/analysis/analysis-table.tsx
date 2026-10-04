"use client";

import Link from "next/link";
import { useMemo } from "react";
import { isStale, isUnfinished, type AnalysisProgress } from "@/lib/analysis/progress";
import { repositoryName } from "@/lib/analysis/url";
import type { AnalysisSummary } from "@/lib/supabase/types";
import { useAnalysisProgress } from "./use-analysis-progress";

const ABSENT = "—";

// UTC, fixed width, no locale: the same row reads the same everywhere.
function timestamp(value: string | null): string {
  return value === null ? ABSENT : value.slice(0, 16).replace("T", " ");
}

interface RowProps {
  analysis: AnalysisSummary;
  /** The server's clock, so a stale row is stale on the first paint as well. */
  now: number;
  published: AnalysisProgress | undefined;
}

// The palette carries one accent and one warning end. On this screen they mean
// live, and failed or abandoned — there are no edges here for direction to
// collide with.
function Row({ analysis, now, published }: RowProps) {
  const status = published !== undefined ? published.status : analysis.status;
  const stage = published !== undefined ? published.stage : analysis.stage;
  const stageMessage = published !== undefined ? published.message : analysis.stage_message;
  const stale = isStale(status, analysis.created_at, now);

  let text: string;
  let className: string;
  if (stale) {
    // Started once and stopped: without this it would read as working for good.
    text = stage === null ? "stale" : `stale · ${stage}`;
    className = "text-outgoing";
  } else if (status === "failed") {
    text = "failed";
    className = "text-outgoing";
  } else if (status === "running") {
    text = stage === null ? "running" : `running · ${stage}`;
    className = "text-accent";
  } else {
    text = status;
    className = "text-muted";
  }

  // A failed run says where it stopped, and a live one says how far it has got.
  // Both belong on the row; neither belongs in a tooltip.
  const detail = analysis.error_message ?? stageMessage;

  return (
    <tr className="align-baseline">
      <td className="border-b border-border py-1 pr-4 font-mono">
        <Link href={`/analysis/${analysis.id}`} className="hover:text-accent">
          {analysis.project === null ? ABSENT : repositoryName(analysis.project.repo_url)}
        </Link>
      </td>
      <td className={`border-b border-border py-1 pr-4 font-mono ${className}`}>{text}</td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.file_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.edge_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.route_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 font-mono text-muted">
        {timestamp(analysis.created_at)}
        {detail !== null && <span className="ml-2">{detail}</span>}
      </td>
    </tr>
  );
}

/**
 * The list, with the unfinished runs subscribed to. A run that is working here
 * says so in every open tab, without anyone reloading anything.
 */
export function AnalysisTable({
  analyses,
  now,
}: {
  analyses: readonly AnalysisSummary[];
  now: number;
}) {
  const unfinished = useMemo(
    () =>
      analyses
        .filter((analysis) => isUnfinished(analysis.status))
        .map((analysis) => analysis.id),
    [analyses],
  );

  const published = useAnalysisProgress(unfinished);

  return (
    <table className="mt-3 w-full border-collapse text-left">
      <thead>
        <tr className="text-[11px] text-muted">
          <th className="border-b border-border py-1 pr-4 font-normal">repository</th>
          <th className="border-b border-border py-1 pr-4 font-normal">state</th>
          <th className="border-b border-border py-1 pr-4 text-right font-normal">files</th>
          <th className="border-b border-border py-1 pr-4 text-right font-normal">edges</th>
          <th className="border-b border-border py-1 pr-4 text-right font-normal">routes</th>
          <th className="border-b border-border py-1 font-normal">started</th>
        </tr>
      </thead>
      <tbody>
        {analyses.map((analysis) => (
          <Row
            key={analysis.id}
            analysis={analysis}
            now={now}
            published={published[analysis.id]}
          />
        ))}
      </tbody>
    </table>
  );
}
