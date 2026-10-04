/**
 * Real explanations, off the traces.
 *
 * The invented-path check runs against what the app actually answered, not
 * against a frozen dataset: a saved set stops describing the prompt the moment
 * the prompt changes, and the question here is what is being said right now.
 *
 * The paths the model was shown are rebuilt from the facts the run recorded,
 * through the same prompt builder the app used — so "shown" means shown, and a
 * change to the prompt shows up in the check without the check being told.
 *
 * A cached explanation is a recorded run with the same facts and the same
 * answer, so it is scored like any other; only the model call is missing.
 */
import type { Client } from "langsmith";
import { filePrompt, folderPrompt, type FileFacts, type FolderFacts } from "../ai/prompts.ts";
import { fieldOf, isFileFacts, isFolderFacts } from "./facts.ts";
import { pathTokens } from "./invented-paths.ts";

export type ExplanationKind = "file" | "folder";

/** The fields these checks read off a run, which is not the whole run. */
interface TracedRun {
  id?: string;
  name?: string;
  project_id?: string;
  trace_id?: string;
  start_time?: string;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}

export interface CheckedExplanation {
  runId: string;
  /** Present when the query asked for them, which is what a link needs. */
  sessionId: string | null;
  traceId: string | null;
  kind: ExplanationKind;
  facts: FileFacts | FolderFacts;
  body: string;
  /** The paths the prompt held, which is what "shown to the model" means. */
  shown: ReadonlySet<string>;
  startedAt: number;
}

export interface SkippedRun {
  runId: string;
  name: string;
  reason: string;
}

export interface RecentExplanations {
  checked: CheckedExplanation[];
  skipped: SkippedRun[];
}

const RUN_NAMES: readonly { name: string; kind: ExplanationKind }[] = [
  { name: "explain-file", kind: "file" },
  { name: "explain-folder", kind: "folder" },
];

/** Recent enough to be the prompt in use, wide enough to survive a quiet week. */
const WINDOW_DAYS = 30;

function startedAt(run: TracedRun): number {
  if (run.start_time === undefined) return 0;
  const parsed = Date.parse(run.start_time);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readRun(run: TracedRun, kind: ExplanationKind): CheckedExplanation | string {
  const body = fieldOf(run.outputs, "body");
  if (typeof body !== "string" || body === "") return "the run recorded no answer";

  const facts = fieldOf(run.inputs, "facts");

  let shown: ReadonlySet<string>;
  let value: FileFacts | FolderFacts;

  if (kind === "file") {
    if (!isFileFacts(facts)) return "the run did not record the facts the prompt was built from";
    value = facts;
    shown = new Set(pathTokens(filePrompt(facts)));
  } else {
    if (!isFolderFacts(facts)) return "the run did not record the facts the prompt was built from";
    value = facts;
    shown = new Set(pathTokens(folderPrompt(facts)));
  }

  return {
    runId: run.id ?? "",
    sessionId: run.project_id ?? null,
    traceId: run.trace_id ?? null,
    kind,
    facts: value,
    body,
    shown,
    startedAt: startedAt(run),
  };
}

/**
 * The most recent explanations in a project, newest first.
 *
 * Each run name is queried separately so the filter language does the obvious
 * thing, and the result is filtered again here: a name mismatch should cost a
 * run, not produce a wrong score.
 */
export async function recentExplanations(
  client: Client,
  projectName: string,
  limit: number,
): Promise<RecentExplanations> {
  if (!(await client.hasProject({ projectName }))) {
    throw new Error(
      `There is no LangSmith project named "${projectName}". Point LANGSMITH_PROJECT at the ` +
        "one the app traces to, or leave it unset for the default project.",
    );
  }

  const project = await client.readProject({ projectName });
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const checked: CheckedExplanation[] = [];
  const skipped: SkippedRun[] = [];

  for (const { name, kind } of RUN_NAMES) {
    let found = 0;
    for await (const run of client.runs.query({
      project_ids: [project.id],
      filter: `eq(name, "${name}")`,
      min_start_time: since,
      page_size: limit,
      // Nothing is returned unless it is asked for, and all of this is read.
      selects: ["ID", "NAME", "START_TIME", "INPUTS", "OUTPUTS", "PROJECT_ID", "TRACE_ID"],
    })) {
      if (run.name !== name) continue;

      const read = readRun(run, kind);
      if (typeof read === "string") {
        skipped.push({ runId: run.id ?? "", name, reason: read });
      } else {
        checked.push(read);
      }

      found += 1;
      if (found >= limit) break;
    }
  }

  checked.sort((left, right) => right.startedAt - left.startedAt);
  return { checked, skipped };
}

/** The link to one run, fetched when there is a failure worth pointing at. */
export async function runUrl(client: Client, entry: CheckedExplanation): Promise<string> {
  if (entry.runId === "" || entry.sessionId === null || entry.traceId === null) return "";

  const response = await client.runs.getURL(entry.runId, {
    project_id: entry.sessionId,
    trace_id: entry.traceId,
    ...(entry.startedAt > 0 ? { start_time: new Date(entry.startedAt).toISOString() } : {}),
  });
  return response.url ?? "";
}
