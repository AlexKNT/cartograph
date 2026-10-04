/**
 * The agent's read-only surface.
 *
 * It has no session of its own: the request carries a signed credential naming
 * one analysis and the organization it belongs to, and the read runs under the
 * asker's own Supabase token, so row-level security still decides which rows
 * come back. Nothing here holds a key that could read past that.
 *
 * Read-only, and deliberately so — the agent's only way to touch the database
 * is to ask one of the six questions in `lib/agent/tools.ts`.
 */

import { NextResponse } from "next/server";
import { mintedRead } from "@/lib/agent/read";
import { isAgentTool, runTool } from "@/lib/agent/tools";
import { verifyCredential } from "@/lib/agent/credential";

export const runtime = "nodejs";

function bearer(header: string | null): string {
  if (header === null) return "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || value === undefined) return "";
  return value;
}

function error(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const credential = verifyCredential(bearer(request.headers.get("authorization")));
  if (credential === null) {
    return error("This credential is missing, expired, or not one this app signed.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("The request body is not JSON.", 400);
  }

  if (typeof body !== "object" || body === null) {
    return error("The request body must be an object naming a tool.", 400);
  }

  const record = body as Record<string, unknown>;
  const tool = record["tool"];
  if (!isAgentTool(tool)) {
    return error("That is not one of this surface's tools.", 400);
  }

  const loaded = await mintedRead(credential);
  if (loaded.kind === "unauthorised") return error(loaded.message, 401);
  if (loaded.kind === "missing") return error("That analysis is not one this credential may read.", 404);
  if (loaded.kind === "unready") return error(loaded.message, 409);
  if (loaded.kind === "unreadable") return error(loaded.message, 502);

  const outcome = runTool(tool, record["input"], loaded.facts);
  // A refusal is an answer, not a failure: it says why nothing was found.
  if (outcome.kind === "refused") return NextResponse.json({ error: outcome.message });

  return NextResponse.json({ output: outcome.value });
}
