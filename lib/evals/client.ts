/**
 * The LangSmith client the checks talk to.
 *
 * A script is a different process from the app, so this is a second place a
 * client is constructed — but it is the only place an eval constructs one, and
 * it is not the AI client: nothing here answers a user's question.
 */
import { Client } from "langsmith";
import { requireEnv } from "../env.ts";

let shared: Client | null = null;

export function evalClient(): Client {
  if (shared === null) {
    requireEnv("LANGSMITH_API_KEY", process.env.LANGSMITH_API_KEY);
    shared = new Client();
  }
  return shared;
}

/** The project the app's traces land in, which is what the checks read. */
export function tracingProject(): string {
  const name = (process.env.LANGSMITH_PROJECT ?? "").trim();
  return name === "" ? "default" : name;
}
