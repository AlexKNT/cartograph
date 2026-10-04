/**
 * The way in.
 *
 * It proves the asker may see this analysis by reading it the way every other
 * page does — under their own organization's policy — then mints a credential
 * naming that one analysis and that one organization, hands it to the agent on
 * the run, and relays the run's stream back. The credential is minted per turn
 * and carries the caller's own short-lived token, so nothing here outlives the
 * request and nothing here can read past row-level security.
 *
 * This route keeps the session; the agent's tools surface does not have one.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { expiryOfToken, mintCredential } from "@/lib/agent/credential";
import { AgentUnreachable, ensureThread, streamRun } from "@/lib/agent/langgraph";
import { encodeEvent, translate, type AgentEvent } from "@/lib/agent/protocol";
import { derivedThreadId } from "@/lib/agent/thread";
import { recordTurn } from "@/lib/agent/record";
import { readAnalysis } from "@/lib/analysis/read";
import { SUPABASE_JWT_TEMPLATE } from "@/lib/env";

export const runtime = "nodejs";

/** A cap, not a policy: a pasted file would otherwise be sent as a question. */
const QUESTION_LIMIT = 4000;

/** The longest a credential may live, however long its token has left. */
const CREDENTIAL_TTL_SECONDS = 300;

/** Below this there is not enough of the token left to finish a turn. */
const MINIMUM_TTL_SECONDS = 10;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/**
 * What the person has open, as a line the agent reads before the question. It
 * is the only thing carried from the interface, and it names a file rather than
 * an analysis, so it cannot widen what the credential already allows.
 */
function compose(question: string, selected: string | null): string {
  if (selected === null) return question;
  return `Selected file: \`${selected}\`\n\n${question}`;
}

function selectedOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  return path === "" ? null : path;
}

/** What the turn did, watched as it goes by. */
interface Watched {
  lookups: string[];
  answer: string;
}

/**
 * The runtime's events, as a stream the browser can read — and, while they pass,
 * what the turn did. The record is written when the stream ends, which is the
 * only moment the answer is complete.
 */
function relay(
  upstream: ReadableStream<Uint8Array>,
  onFinish: (watched: Watched) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const watched: Watched = { lookups: [], answer: "" };
      const called = new Set<string>();

      const send = (event: AgentEvent): void => {
        if (event.type === "tool" && !called.has(event.id)) {
          called.add(event.id);
          watched.lookups.push(event.name);
        }
        if (event.type === "text") watched.answer += event.delta;

        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The reader is gone; the rest of the turn has nowhere to go.
        }
      };

      try {
        for await (const event of translate(upstream)) send(event);
      } catch (error) {
        send({ type: "error", message: `The agent's stream ended early: ${errorText(error)}` });
      } finally {
        await onFinish(watched);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { orgId, userId, getToken } = await auth();
  if (orgId === undefined || orgId === null || userId === undefined || userId === null) {
    return NextResponse.json({ error: "This session has no organization to ask under." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const analysisId = fieldOf(body, "analysisId");
  const question = fieldOf(body, "question");
  if (typeof analysisId !== "string" || analysisId === "") {
    return NextResponse.json({ error: "No analysis was named." }, { status: 400 });
  }
  if (typeof question !== "string" || question.trim() === "") {
    return NextResponse.json({ error: "Ask something about the repository." }, { status: 400 });
  }
  if (question.length > QUESTION_LIMIT) {
    return NextResponse.json({ error: "That question is too long to send." }, { status: 400 });
  }

  // The proof: this is the same read the analysis page does, so it returns a row
  // only when the asker's organization is the one that owns it.
  const loaded = await readAnalysis(analysisId);
  if (loaded.kind === "missing") {
    return NextResponse.json({ error: "That analysis is not here." }, { status: 404 });
  }
  if (loaded.kind === "unreadable") {
    return NextResponse.json({ error: `Could not read this analysis: ${loaded.message}` }, { status: 502 });
  }
  if (loaded.value.status !== "ready") {
    return NextResponse.json(
      { error: "This analysis has no map yet, so there is nothing to ask it." },
      { status: 409 },
    );
  }

  const token = await getToken({ template: SUPABASE_JWT_TEMPLATE });
  if (token === null || token === "") {
    return NextResponse.json({ error: "Could not mint a token to read with." }, { status: 500 });
  }

  const expiresAt = expiryOfToken(token);
  const ttl =
    expiresAt === null
      ? CREDENTIAL_TTL_SECONDS
      : Math.min(CREDENTIAL_TTL_SECONDS, Math.floor((expiresAt - Date.now()) / 1000));
  if (ttl < MINIMUM_TTL_SECONDS) {
    return NextResponse.json(
      {
        error:
          "The read token expires too soon to finish a turn. Give the Clerk Supabase JWT template a longer lifetime.",
      },
      { status: 500 },
    );
  }

  const selected = selectedOf(fieldOf(body, "selected"));
  const askedAt = Date.now();

  try {
    const credential = mintCredential({
      analysisId,
      organizationId: orgId,
      token,
      ttlSeconds: ttl,
    });
    const threadId = derivedThreadId(orgId, userId, analysisId);

    await ensureThread(threadId);
    const upstream = await streamRun({
      threadId,
      message: compose(question.trim(), selected),
      credential,
      signal: request.signal,
    });

    return new Response(
      relay(upstream, (watched) =>
        recordTurn({
          analysisId,
          question: question.trim(),
          selected,
          lookups: watched.lookups,
          answer: watched.answer,
          startedAt: askedAt,
          endedAt: Date.now(),
        }),
      ),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-cartograph-thread": threadId,
        },
      },
    );
  } catch (error) {
    if (error instanceof AgentUnreachable) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: errorText(error) }, { status: 500 });
  }
}
