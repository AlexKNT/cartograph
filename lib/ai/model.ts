/**
 * The model calls, apart from the database work wrapped around them.
 *
 * These live on their own because the checks make the same calls without a
 * session: the role check labels paths and the prompt comparison runs a prompt
 * the app no longer ships. Reaching them through the cached explainer would
 * drag Supabase and Clerk into a plain script for no reason.
 *
 * The client still comes from one place — `./client.ts` — so these calls are
 * traced exactly like the ones the app makes.
 */
import { CLASSIFIABLE_ROLE_IDS } from "../graph/rail.ts";
import { aiClient } from "./client.ts";
import { CLASSIFY_SYSTEM, MODEL, classifyPrompt } from "./prompts.ts";

/**
 * One explanation call. The system prompt is an argument rather than a constant
 * because the comparison has to run a retired prompt too, and a second call
 * shape would be a second thing to keep in step.
 */
export async function askExplanation(system: string, prompt: string): Promise<string> {
  const response = await aiClient().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 500,
    // The graph is someone else's source code read into a shape. Asking the
    // provider not to keep it is written down rather than assumed.
    store: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });

  const body = response.choices[0]?.message.content?.trim() ?? "";
  if (body === "") throw new Error("The model answered with nothing.");
  return body;
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** The `{path: role}` pairs out of the model's answer, unvalidated. */
function parseRoles(content: string): [string, string][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The model did not answer with JSON.");
  }

  const roles = fieldOf(parsed, "roles");
  if (typeof roles !== "object" || roles === null) return [];

  const record = roles as Record<string, unknown>;
  const entries: [string, string][] = [];
  for (const path of Object.keys(record)) {
    const role = record[path];
    if (typeof role === "string") entries.push([path, role]);
  }
  return entries;
}

/**
 * The model's labels for a batch, keyed by the path it was asked about.
 *
 * Kept strictly: a path nobody asked about and a role the rail cannot show are
 * both dropped, because a role is what colours the map.
 */
export async function classifyPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const response = await aiClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1500,
    store: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: classifyPrompt(paths) },
    ],
  });

  const asked = new Set(paths);
  const labels = new Map<string, string>();

  for (const [path, role] of parseRoles(response.choices[0]?.message.content ?? "")) {
    if (asked.has(path) && CLASSIFIABLE_ROLE_IDS.includes(role)) labels.set(path, role);
  }
  return labels;
}
