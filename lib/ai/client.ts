/**
 * The one place a model client is constructed.
 *
 * Everything that talks to OpenAI comes through here, so every call carries the
 * LangSmith wrapper. A second `new OpenAI()` anywhere else would silently skip
 * tracing, and a call that is not in the traces is a call nobody can check.
 *
 * Tracing is configuration, not a requirement. With no key the wrapped calls
 * still run — they are simply not recorded — which is why `tracingConfigured`
 * exists: an absent key otherwise looks exactly like a working setup with no
 * traffic.
 */

import { wrapOpenAI } from "langsmith/wrappers/openai";
import OpenAI from "openai";
import { requireEnv } from "../env.ts";

let shared: OpenAI | null = null;

/** The client, built once per process. */
export function aiClient(): OpenAI {
  if (shared === null) {
    shared = wrapOpenAI(
      new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY) }),
    );
  }
  return shared;
}

/**
 * Whether runs are being sent anywhere. LangSmith reads these variables itself,
 * so this mirrors its own gate rather than inventing a second one.
 */
export function tracingConfigured(): boolean {
  const enabled =
    process.env.LANGSMITH_TRACING === "true" || process.env.LANGSMITH_TRACING_V2 === "true";
  return enabled && (process.env.LANGSMITH_API_KEY ?? "").trim() !== "";
}
