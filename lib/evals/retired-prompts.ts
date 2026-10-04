/**
 * The explanation prompt that was retired, kept here rather than in the app.
 *
 * A dead prompt in the application is the test shaping the product: code that
 * ships only so an experiment can name it. It belongs with the experiment, so
 * it is kept here, frozen at the shape it had before the rules that are being
 * measured were added.
 *
 * This is the version-0 draft: it hands the model the same facts but does not
 * constrain what it may name, does not forbid headings, and does not ask for
 * the short paragraphs the pane needs.
 */
import type { Neighbour } from "../ai/prompts.ts";

export const RETIRED_FILE_PROMPT_VERSION = "file-explain-0";

export interface RetiredFileFacts {
  path: string;
  lines: number;
  role: string | null;
  imports: readonly Neighbour[];
  importers: readonly Neighbour[];
}

export const RETIRED_EXPLAIN_SYSTEM = [
  "You explain one part of a codebase from a dependency graph that was parsed from its source.",
  "You are given paths, sizes, roles and connections, and you write a helpful explanation of the file.",
  "",
  "Use headings where they help, and be as thorough as the file deserves.",
].join("\n");

export function retiredFilePrompt(facts: RetiredFileFacts): string {
  const imports =
    facts.imports.length === 0
      ? ["- nothing"]
      : facts.imports.map((neighbour) => `- ${neighbour.path} (${neighbour.kinds.join(", ")})`);
  const importers =
    facts.importers.length === 0
      ? ["- nothing"]
      : facts.importers.map((neighbour) => `- ${neighbour.path} (${neighbour.kinds.join(", ")})`);

  return [
    `File: ${facts.path} (${facts.lines} lines)`,
    `Role: ${facts.role ?? "none assigned"}`,
    "",
    "Imports:",
    ...imports,
    "",
    "Imported by:",
    ...importers,
    "",
    "Describe this file, what it is responsible for, and how it fits with the files around it.",
  ].join("\n");
}
