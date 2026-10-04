"use client";

import { RUN_STAGES } from "@/lib/analysis/progress";
import { useAnalysisProgress } from "./use-analysis-progress";

export interface AnalysisProgressProps {
  analysisId: string;
  /** The row as it was when the page was rendered, before anything is published. */
  stage: string | null;
  message: string | null;
}

/**
 * The run, named stage by stage. Four stages rather than a spinner, because
 * "reading imports" and "writing rows" are different waits and only the second
 * one is nearly over.
 */
export function AnalysisProgressView({ analysisId, stage, message }: AnalysisProgressProps) {
  const published = useAnalysisProgress([analysisId]);
  const event = published[analysisId];

  const current = event !== undefined ? event.stage : stage;
  const detail = event !== undefined ? event.message : message;
  const reached = current === null ? -1 : RUN_STAGES.findIndex((name) => name === current);

  return (
    <div className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        {RUN_STAGES.map((name, index) => (
          <span key={name} className="flex items-center gap-2">
            {index > 0 && <span className="text-border">·</span>}
            <span
              className={
                index === reached
                  ? "text-accent"
                  : index < reached
                    ? "text-muted"
                    : "text-muted opacity-50"
              }
            >
              {name}
            </span>
          </span>
        ))}
      </div>

      <p className="font-mono text-[11px] text-muted">
        {detail ?? (current === null ? "waiting to start" : current)}
      </p>
    </div>
  );
}
