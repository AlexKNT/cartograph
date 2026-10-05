/**
 * The one place the tools reach the repository.
 *
 * Every tool is a thin call to the app's read-only surface, with the run's
 * credential attached. The surface decides which analysis that credential names,
 * so nothing here chooses one, and the model never sees either.
 */
import type { ToolRuntime } from "@langchain/core/tools";

/** The six names the surface understands, spelled exactly as it spells them. */
export type SurfaceTool =
  | "summary"
  | "find_files"
  | "files_by_role"
  | "file_neighbours"
  | "walk"
  | "routes";

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** The credential out of the runtime context, checked rather than trusted. */
function credentialOf(runtime: ToolRuntime): string {
  const credential = fieldOf(runtime.context, "credential");
  if (typeof credential !== "string" || credential === "") {
    throw new Error(
      "This run carries no credential, so the repository cannot be read. Start the conversation from the app.",
    );
  }
  return credential;
}

function surfaceUrl(): string {
  const base = (process.env.CARTOGRAPH_TOOLS_URL ?? "").trim();
  if (base === "") {
    throw new Error("CARTOGRAPH_TOOLS_URL is not set, so the repository tools have nowhere to read from.");
  }
  return base;
}

/**
 * Ask the surface one question and hand back what it found, as JSON text.
 *
 * A refusal comes back as the tool's answer rather than an exception: "there is
 * no file called that" is something the agent has to be able to say, and turning
 * it into a tool error would only hide the reason. A surface that is not there,
 * or not answering with JSON, does throw — the agent should not paper over that.
 */
export async function callSurface(
  tool: SurfaceTool,
  input: unknown,
  runtime: ToolRuntime,
): Promise<string> {
  const response = await fetch(surfaceUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${credentialOf(runtime)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tool, input }),
  });

  const body = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`The tools surface answered ${response.status} with something that is not JSON.`);
  }

  const error = fieldOf(payload, "error");
  if (typeof error === "string" && error !== "") return error;

  const output = fieldOf(payload, "output");
  if (output === undefined) throw new Error("The tools surface answered without an output.");
  return JSON.stringify(output);
}
