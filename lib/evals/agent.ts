/**
 * The agent checks, as arithmetic.
 *
 * Two questions, both with an exact answer from a recorded turn. Did the agent
 * look anything up before it answered? An answer with no lookups behind it is
 * the failure this product exists to prevent, so it is counted rather than
 * judged. And did it talk about itself — its tools, its instructions, its
 * model — instead of about the code?
 *
 * Both are counted over the turns the app actually recorded, because a frozen
 * sample stops describing the instructions the moment they change.
 */

import type { Client } from "langsmith";
import { TURN_RUN } from "../agent/record.ts";
import { fieldOf } from "./facts.ts";

/** The six tools that count as looking. A plan or a file listing does not. */
export const LOOKUP_TOOLS: readonly string[] = [
  "analysis_summary",
  "find_files",
  "files_by_role",
  "file_neighbours",
  "walk_dependencies",
  "route_table",
];

/**
 * What talking about your own plumbing sounds like. Deliberately narrow: the
 * refusal the product asks for ("I cannot judge code quality") is not plumbing,
 * and must not be counted as it.
 */
const PLUMBING: readonly { phrase: string; pattern: RegExp }[] = [
  { phrase: "tool call", pattern: /\btool calls?\b/i },
  { phrase: "my tools", pattern: /\bmy tools\b/i },
  { phrase: "the tools", pattern: /\bthe tools (?:i|available|returned)\b/i },
  { phrase: "tool result", pattern: /\btool results?\b/i },
  { phrase: "system prompt", pattern: /\bsystem prompt\b/i },
  { phrase: "my instructions", pattern: /\bmy instructions\b/i },
  { phrase: "language model", pattern: /\blanguage model\b/i },
  { phrase: "as an AI", pattern: /\bas an ai\b/i },
  { phrase: "LangGraph", pattern: /\blanggraph\b/i },
  { phrase: "LangChain", pattern: /\blangchain\b/i },
  { phrase: "deep agent", pattern: /\bdeep ?agents?\b/i },
  { phrase: "credential", pattern: /\bcredentials?\b/i },
];

export interface CheckedTurn {
  runId: string;
  /** Present when the query asked for them, which is what a link needs. */
  sessionId: string | null;
  traceId: string | null;
  question: string;
  lookups: string[];
  answer: string;
  startedAt: number;
}

export interface SkippedTurn {
  runId: string;
  reason: string;
}

export interface AgentScore {
  checked: number;
  /** Turns where at least one lookup was made. */
  looked: number;
  /** Turns that answered without looking anything up. */
  hedged: CheckedTurn[];
  /** Turns whose answer talked about the agent rather than the code. */
  plumbing: { turn: CheckedTurn; phrase: string }[];
}

/** The first phrase that gives the agent away, or null when it stayed on the code. */
export function plumbingIn(answer: string): string | null {
  for (const { phrase, pattern } of PLUMBING) {
    if (pattern.test(answer)) return phrase;
  }
  return null;
}

export function scoreTurns(turns: readonly CheckedTurn[]): AgentScore {
  const hedged: CheckedTurn[] = [];
  const plumbing: { turn: CheckedTurn; phrase: string }[] = [];
  let looked = 0;

  for (const turn of turns) {
    if (turn.lookups.some((name) => LOOKUP_TOOLS.includes(name))) {
      looked += 1;
    } else if (turn.answer.trim() !== "") {
      hedged.push(turn);
    }

    const phrase = plumbingIn(turn.answer);
    if (phrase !== null) plumbing.push({ turn, phrase });
  }

  return { checked: turns.length, looked, hedged, plumbing };
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function readRun(run: {
  id?: string;
  project_id?: string;
  trace_id?: string;
  start_time?: string;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}): CheckedTurn | string {
  const question = fieldOf(run.inputs, "question");
  if (!isText(question) || question === "") return "the run did not record the question";

  const answer = fieldOf(run.outputs, "answer");
  if (!isText(answer)) return "the run did not record an answer";

  const raw = fieldOf(run.outputs, "lookups");
  if (!Array.isArray(raw) || !raw.every(isText)) return "the run did not record what was looked up";

  const startedAt = run.start_time === undefined ? 0 : Date.parse(run.start_time);

  return {
    runId: run.id ?? "",
    sessionId: run.project_id ?? null,
    traceId: run.trace_id ?? null,
    question,
    lookups: raw,
    answer,
    startedAt: Number.isNaN(startedAt) ? 0 : startedAt,
  };
}

/** Recent turns, newest first. Anything that is not a turn is reported as skipped. */
export async function recentTurns(
  client: Client,
  projectName: string,
  limit: number,
): Promise<{ checked: CheckedTurn[]; skipped: SkippedTurn[] }> {
  if (!(await client.hasProject({ projectName }))) {
    throw new Error(
      `There is no LangSmith project named "${projectName}". Point LANGSMITH_PROJECT at the ` +
        "one the app traces to, or leave it unset for the default project.",
    );
  }

  const project = await client.readProject({ projectName });
  const windowDays = 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const checked: CheckedTurn[] = [];
  const skipped: SkippedTurn[] = [];

  for await (const run of client.runs.query({
    project_ids: [project.id],
    filter: `eq(name, "${TURN_RUN}")`,
    min_start_time: since,
    page_size: limit,
    selects: ["ID", "NAME", "START_TIME", "INPUTS", "OUTPUTS", "PROJECT_ID", "TRACE_ID"],
  })) {
    if (run.name !== TURN_RUN) continue;

    const read = readRun(run);
    if (typeof read === "string") skipped.push({ runId: run.id ?? "", reason: read });
    else checked.push(read);

    if (checked.length + skipped.length >= limit) break;
  }

  checked.sort((left, right) => right.startedAt - left.startedAt);
  return { checked, skipped };
}

/** The link to one run, fetched when there is a failure worth pointing at. */
export async function turnUrl(client: Client, turn: CheckedTurn): Promise<string> {
  if (turn.runId === "" || turn.sessionId === null || turn.traceId === null) return "";

  const response = await client.runs.getURL(turn.runId, {
    project_id: turn.sessionId,
    trace_id: turn.traceId,
    ...(turn.startedAt > 0 ? { start_time: new Date(turn.startedAt).toISOString() } : {}),
  });
  return response.url ?? "";
}
