/**
 * What the model is told, and how it is told to answer.
 *
 * Pure: no client, no database, no framework. Each prompt is a function of
 * facts the parser produced, so what was asked can be reconstructed from what
 * was stored — which is what the evals need a phase from now.
 *
 * The model never sees a file's contents. It sees the file's place in the
 * graph, and every path it is allowed to name is in the prompt. That is the
 * whole point: an explanation is a reading of the parse, not a second parser.
 */

import { CLASSIFIABLE_ROLE_IDS } from "../graph/rail.ts";

/**
 * Pinned to the versioned name on purpose. A moving alias would change what
 * answers a question without changing anything in the cache key, and the
 * stored explanation would quietly keep meaning something slightly different.
 */
export const MODEL = "gpt-4.1-mini-2025-04-14";

/**
 * Part of the explanation cache key. Bumping one invalidates that prompt's
 * answers and leaves the others alone.
 */
export const FILE_PROMPT_VERSION = "file-explain-1";
export const FOLDER_PROMPT_VERSION = "folder-explain-1";

/** One thing a file is connected to, and how. */
export interface Neighbour {
  path: string;
  kinds: readonly string[];
}

/** What the model is told about a single file. Every neighbour, not a sample. */
export interface FileFacts {
  path: string;
  lines: number;
  /** The role convention gave it, or null when nothing did. */
  role: string | null;
  imports: readonly Neighbour[];
  importers: readonly Neighbour[];
}

/** What the model is told about one folded folder. */
export interface FolderFacts {
  path: string;
  files: readonly { path: string; role: string | null }[];
  /** Folders this one imports from. */
  imports: readonly string[];
  /** Folders that import this one. */
  importedBy: readonly string[];
  /** Files outside the folder that import into it. */
  pointingIn: readonly string[];
}

export const EXPLAIN_SYSTEM = [
  "You explain one part of a codebase from a dependency graph that was parsed from its source.",
  "You are given paths, sizes, roles and connections. You are never given the file contents,",
  "so do not describe code you have not been shown.",
  "",
  "Rules:",
  "- Name only paths that appear in the lists you were given. An invented path is worse than a",
  "  missing detail, because someone will click it.",
  "- Never call two files connected unless the connection is in the lists.",
  "- Explain; do not review. No quality judgements, no suggestions, no severity.",
  "- Short paragraphs. Under 120 words, or under 180 when the file is a hub.",
  "",
  "Format: `backticks` around a path or an identifier, **bold** for a term worth landing on,",
  'and "- " bullets when a list genuinely helps. No headings, no tables, no numbered lists,',
  "no code blocks.",
].join("\n");

export const CLASSIFY_SYSTEM = [
  "You label files whose framework conventions did not identify them.",
  "You are given file paths and nothing else, so the label has to follow from the path itself.",
  "",
  "Answer with JSON only: {\"roles\": {\"<path>\": \"<role>\"}}, one entry per path given.",
  `Each role is one of: ${CLASSIFIABLE_ROLE_IDS.join(", ")}.`,
  'Answer "unknown" for a path that does not clearly imply one of them.',
  "",
  "Never answer page, route or controller: routing is decided by the files themselves and a",
  "guess there would invent structure. Never add a path that was not given to you.",
].join("\n");

function neighbourLine(neighbour: Neighbour): string {
  return `- ${neighbour.path} (${neighbour.kinds.join(", ")})`;
}

export function filePrompt(facts: FileFacts): string {
  const imports =
    facts.imports.length === 0
      ? ["- nothing"]
      : facts.imports.map(neighbourLine);
  const importers =
    facts.importers.length === 0
      ? ["- nothing"]
      : facts.importers.map(neighbourLine);

  return [
    `File: ${facts.path}`,
    `${facts.lines} lines`,
    `Role: ${facts.role ?? "none assigned"}`,
    "",
    "It imports:",
    ...imports,
    "",
    "It is imported by:",
    ...importers,
    "",
    "Say what this file is for and where it sits among these neighbours.",
  ].join("\n");
}

export function folderPrompt(facts: FolderFacts): string {
  const files =
    facts.files.length === 0
      ? ["- nothing"]
      : facts.files.map((file) => `- ${file.path}${file.role === null ? "" : ` — ${file.role}`}`);
  const imports = facts.imports.length === 0 ? ["- nothing"] : facts.imports.map((p) => `- ${p}`);
  const importedBy =
    facts.importedBy.length === 0 ? ["- nothing"] : facts.importedBy.map((p) => `- ${p}`);
  const pointingIn =
    facts.pointingIn.length === 0 ? ["- nothing"] : facts.pointingIn.map((p) => `- ${p}`);

  return [
    `Folder: ${facts.path}`,
    `${facts.files.length} files`,
    "",
    "It holds:",
    ...files,
    "",
    "It imports from (folders):",
    ...imports,
    "",
    "It is imported by (folders):",
    ...importedBy,
    "",
    "Files outside it that import into it:",
    ...pointingIn,
    "",
    "Say what this folder holds and why so much points at it. If little or nothing points at it,",
    "say that rather than making it sound central.",
  ].join("\n");
}

export function classifyPrompt(paths: readonly string[]): string {
  return [
    'Reply with JSON: {"roles": {"<path>": "<role>"}}',
    "",
    "Paths:",
    ...paths.map((path) => `- ${path}`),
  ].join("\n");
}
