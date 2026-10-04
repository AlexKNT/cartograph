import type { AnalysisStatus } from "../supabase/types.ts";

/**
 * The run's own steps, in the order they happen. A stage name is a fact about
 * the pipeline rather than about the repository, which is why the `stage`
 * column is free text and why these live in application code.
 */
export const RUN_STAGES = ["fetch", "select", "parse", "store", "label"] as const;

export type RunStage = (typeof RUN_STAGES)[number];

/** The event the trigger publishes and the page listens for. */
export const PROGRESS_EVENT = "progress";

/** What the trigger publishes and the page subscribes to. */
export interface AnalysisProgress {
  stage: string | null;
  message: string | null;
  status: AnalysisStatus;
}

/** The channel a run's progress is published on. The migration spells it the same way. */
export function analysisTopic(analysisId: string): string {
  return `analysis:${analysisId}`;
}

/**
 * Past this, an unfinished run is something that stopped rather than something
 * working. Nothing here has a queue or a timeout, so a process that dies leaves
 * a row saying "parsing" forever, and the difference has to be legible.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export function isUnfinished(status: AnalysisStatus): boolean {
  return status === "queued" || status === "running";
}

export function isStale(
  status: AnalysisStatus,
  createdAt: string,
  now: number,
): boolean {
  return isUnfinished(status) && now - Date.parse(createdAt) > STALE_AFTER_MS;
}

const STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "ready",
  "failed",
] satisfies AnalysisStatus[]);

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/**
 * What arrived on the channel, checked rather than trusted. It is our own
 * trigger at the other end, but a payload is still something that came over a
 * socket, and the alternative to checking it is a component that renders
 * whatever it was handed.
 */
export function isAnalysisProgress(value: unknown): value is AnalysisProgress {
  const status = fieldOf(value, "status");
  if (typeof status !== "string" || !STATUSES.has(status)) return false;

  const stage = fieldOf(value, "stage");
  if (stage !== null && typeof stage !== "string") return false;

  const message = fieldOf(value, "message");
  return message === null || typeof message === "string";
}
