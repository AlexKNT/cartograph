/**
 * The agent service, as this app talks to it.
 *
 * The service is the LangGraph runtime, so the app writes no server, no thread
 * store and no streaming of its own: it opens a conversation, starts a run on
 * it, and reads the run's stream back. The one thing it adds is the credential,
 * which travels on the run rather than in the message, so the model never sees
 * which analysis it is reading.
 */

import { requireEnv } from "../env.ts";

/** The graph key in the agent project's config, which is its assistant id. */
const ASSISTANT = "agent";

/** The service is not there, or will not start the run. */
export class AgentUnreachable extends Error {}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function base(): string {
  return requireEnv("AGENT_URL", process.env.AGENT_URL).replace(/\/+$/, "");
}

async function call(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${base()}${path}`, init);
  } catch (error) {
    throw new AgentUnreachable(
      `The agent service could not be reached at ${base()} (${errorText(error)}).`,
    );
  }
}

/**
 * Make sure the conversation exists. The id is derived by the caller, so this
 * creates it the first time and leaves it alone after that — a second turn
 * continues the thread rather than starting a new one.
 */
export async function ensureThread(threadId: string): Promise<void> {
  const response = await call("/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, if_exists: "do_nothing" }),
  });

  // A runtime that ignores `if_exists` answers a second create with a conflict,
  // which is the same thing this wanted.
  if (!response.ok && response.status !== 409) {
    throw new AgentUnreachable(
      `The agent service answered ${response.status} when opening a conversation.`,
    );
  }
}

export interface RunRequest {
  threadId: string;
  /** The user's turn, already assembled. */
  message: string;
  /** The signed credential, carried on the run and read by the tools. */
  credential: string;
  signal: AbortSignal;
}

/**
 * Start a turn and hand back its event stream unread. The caller translates it;
 * this only makes sure there is a stream to translate.
 */
export async function streamRun(request: RunRequest): Promise<ReadableStream<Uint8Array>> {
  const response = await call(
    `/threads/${encodeURIComponent(request.threadId)}/runs/stream`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        assistant_id: ASSISTANT,
        input: { messages: [{ role: "user", content: request.message }] },
        // The analysis lives here and nowhere else, so nothing the agent reads
        // can name a different one.
        context: { credential: request.credential },
        stream_mode: ["messages"],
      }),
      signal: request.signal,
    },
  );

  if (!response.ok || response.body === null) {
    throw new AgentUnreachable(`The agent service answered ${response.status} when starting the run.`);
  }
  return response.body;
}
