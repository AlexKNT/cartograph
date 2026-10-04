"use client";

/**
 * The Explanation tab.
 *
 * Everything about a subject that was explained stays in the shell above this,
 * keyed by the subject, so moving the selection away and back shows the same
 * paragraph without a second click. Clicking Explain again is a real call, and
 * a second one lands in the traces — a cache nobody can see firing is a cache
 * nobody can trust.
 */

import { Prose } from "@/components/graph/prose";
import { reRunAnalysis } from "@/lib/actions/analyse";
import type { ExplainOutcome } from "@/lib/ai/explain";
import type { Selection } from "@/lib/graph/types";

export type ExplanationState = { kind: "working" } | { kind: "done"; outcome: ExplainOutcome };

/** What an explanation is kept under: the subject, never the tab. */
export function explanationKey(selection: Selection): string {
  return selection.kind === "file" ? `file:${selection.path}` : `node:${selection.node}`;
}

const STALE_REASON = {
  "file-changed": "this file has changed since this run read it",
  "file-gone": "this file is not in the repository any more",
  "repository-moved": "the repository has moved past the commit this run read",
} as const;

function bodyOf(state: ExplanationState | null): string | null {
  if (state === null || state.kind !== "done") return null;
  if (state.outcome.status === "explained") return state.outcome.body;
  if (state.outcome.status === "stale") return state.outcome.body;
  return null;
}

export interface ExplanationPaneProps {
  analysisId: string;
  selection: Selection | null;
  /** What this subject's explanation came to, or null when it has not been asked for. */
  state: ExplanationState | null;
  /** False when LangSmith is unconfigured, which is worth saying out loud. */
  tracing: boolean;
  /** Every path in the repository, so a path in prose can become a link. */
  paths: ReadonlySet<string>;
  onExplain: (selection: Selection) => void;
  onSelectPath: (path: string) => void;
}

export function ExplanationPane({
  analysisId,
  selection,
  state,
  tracing,
  paths,
  onExplain,
  onSelectPath,
}: ExplanationPaneProps) {
  const body = bodyOf(state);

  const tracingNote = tracing ? null : (
    <p className="font-mono text-[10px] text-muted">
      tracing off: set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to record these calls
    </p>
  );

  if (selection === null) {
    return (
      <div className="flex flex-col gap-2 px-1">
        {tracingNote}
        <p className="text-[11px] text-muted">
          Select a file or a folder on the map, then explain it.
        </p>
      </div>
    );
  }

  const outcome = state !== null && state.kind === "done" ? state.outcome : null;
  const provenance =
    outcome === null || outcome.status === "failed"
      ? null
      : outcome.status === "explained"
        ? `${outcome.model} · ${outcome.cached ? "cached" : "fresh"}`
        : outcome.model;

  return (
    <div className="flex flex-col gap-3 px-1">
      {tracingNote}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onExplain(selection)}
          disabled={state !== null && state.kind === "working"}
          className="rounded border border-border px-1.5 text-[11px] text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
        >
          {state !== null && state.kind === "working" ? "explaining…" : "Explain"}
        </button>
        {provenance !== null && (
          <span className="font-mono text-[10px] text-muted">{provenance}</span>
        )}
      </div>

      {outcome !== null && outcome.status === "stale" && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] text-outgoing">{STALE_REASON[outcome.reason]}</p>
          <p className="text-[11px] text-muted">
            {outcome.body === null
              ? "Nothing is explained against a commit that is behind. Re-analyse to explain the one that is there now."
              : "What is below was written from the commit this run read."}
          </p>
          <form action={reRunAnalysis.bind(null, analysisId)}>
            <button
              type="submit"
              className="rounded border border-border px-1.5 text-[11px] text-muted hover:border-accent hover:text-foreground"
            >
              re-analyse
            </button>
          </form>
        </div>
      )}

      {outcome !== null && outcome.status === "failed" && (
        <p className="font-mono text-[11px] text-outgoing">{outcome.message}</p>
      )}

      {body !== null && <Prose body={body} paths={paths} onSelectPath={onSelectPath} />}
    </div>
  );
}
