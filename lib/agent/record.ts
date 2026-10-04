/**
 * What the agent did, kept where the checks can read it.
 *
 * The agent runs in its own service and traces its own turns; the app cannot
 * rely on that, so it writes down what it watched: the question, the tools the
 * agent called, and the answer. That is the whole of what the hedging and
 * plumbing checks need, and it lands in the same project the app's explanations
 * do, so one place holds everything that was said.
 *
 * This is the one place a LangSmith client is constructed for writing. It is
 * not the AI client — that is `lib/ai/client.ts`, and it stays the only place a
 * model is called from.
 */

import { Client } from "langsmith";
import { tracingConfigured } from "../ai/client.ts";

/** The run name the agent checks read. */
export const TURN_RUN = "ask-repository";

export interface TurnRecord {
  analysisId: string;
  question: string;
  /** What the person had open, or null. */
  selected: string | null;
  /** Every tool the agent called, in order, including any repeats. */
  lookups: readonly string[];
  answer: string;
  startedAt: number;
  endedAt: number;
}

let shared: Client | null = null;

function client(): Client {
  if (shared === null) shared = new Client();
  return shared;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Record one turn. A record that will not write is said out loud and dropped:
 * an answer already given is worth more than a trace of it.
 */
export async function recordTurn(turn: TurnRecord): Promise<void> {
  if (!tracingConfigured()) return;

  try {
    await client().createRun({
      name: TURN_RUN,
      run_type: "chain",
      start_time: new Date(turn.startedAt).toISOString(),
      end_time: new Date(turn.endedAt).toISOString(),
      inputs: {
        analysisId: turn.analysisId,
        question: turn.question,
        selected: turn.selected,
      },
      outputs: { lookups: [...turn.lookups], answer: turn.answer },
    });
  } catch (error) {
    console.error(`Could not record the agent's turn: ${errorText(error)}`);
  }
}
