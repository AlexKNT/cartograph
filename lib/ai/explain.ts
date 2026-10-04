/**
 * Explaining one thing, with the cache read inside the traced call.
 *
 * The order matters and is the whole design: the trace is opened first, the
 * cache is consulted inside it, and only a miss reaches the model. A cache hit
 * therefore lands in the traces as a recorded run containing no model call —
 * which is the only way to tell a working cache from one that never fires.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";
import { createServerSupabaseClient } from "../supabase/server.ts";
import { aiClient } from "./client.ts";
import {
  EXPLAIN_SYSTEM,
  FILE_PROMPT_VERSION,
  FOLDER_PROMPT_VERSION,
  MODEL,
  filePrompt,
  folderPrompt,
  type FileFacts,
  type FolderFacts,
} from "./prompts.ts";

export type SubjectKind = "file" | "folder";

/** What one traced explanation is given. Plain data, so the trace can show it. */
interface Subject {
  analysisId: string;
  organizationId: string;
  /** The row the cache hangs off, when the subject is a file. */
  fileId: string | null;
  subjectKind: SubjectKind;
  /** The path of the file or folder being explained. */
  path: string;
  /** The content of the thing explained: what the cache is keyed on. */
  contentHash: string;
  promptVersion: string;
  /** True when the repository has moved past the commit this run read. */
  stale: boolean;
  prompt: string;
}

export interface FileExplainInput {
  analysisId: string;
  organizationId: string;
  fileId: string;
  contentHash: string;
  stale: boolean;
  facts: FileFacts;
}

export interface FolderExplainInput {
  analysisId: string;
  organizationId: string;
  contentHash: string;
  stale: boolean;
  facts: FolderFacts;
}

/** What one explanation came to. */
export type Explanation =
  | { status: "explained"; body: string; cached: boolean; model: string }
  /** The run is behind the repository, so nothing new is written for it. */
  | { status: "stale"; body: string | null; model: string };

/**
 * What the pane is handed. It lives here rather than in the action module,
 * because a "use server" module may only export functions.
 */
export type ExplainOutcome =
  | { status: "explained"; body: string; cached: boolean; model: string }
  | {
      status: "stale";
      body: string | null;
      model: string;
      reason: "file-changed" | "file-gone" | "repository-moved";
    }
  | { status: "failed"; message: string };

async function readCached(supabase: SupabaseClient, subject: Subject): Promise<string | null> {
  const { data, error } = await supabase
    .from("explanations")
    .select("body")
    .eq("analysis_id", subject.analysisId)
    .eq("subject_kind", subject.subjectKind)
    .eq("subject", subject.path)
    .eq("content_hash", subject.contentHash)
    .eq("model", MODEL)
    .eq("prompt_version", subject.promptVersion)
    .limit(1)
    .maybeSingle()
    .overrideTypes<{ body: string }, { merge: false }>();

  if (error !== null) {
    throw new Error(`Could not read the explanation cache: ${error.message}`);
  }
  return data?.body ?? null;
}

async function writeCached(
  supabase: SupabaseClient,
  subject: Subject,
  body: string,
): Promise<void> {
  const { error } = await supabase.from("explanations").insert({
    organization_id: subject.organizationId,
    analysis_id: subject.analysisId,
    file_id: subject.fileId,
    subject_kind: subject.subjectKind,
    subject: subject.path,
    content_hash: subject.contentHash,
    model: MODEL,
    prompt_version: subject.promptVersion,
    body,
  });

  // The explanation is already in hand, so a cache that would not take it is
  // worth saying out loud and not worth throwing away the answer over.
  if (error !== null) {
    console.error(`Could not cache the explanation of ${subject.path}: ${error.message}`);
  }
}

async function askModel(prompt: string): Promise<string> {
  const response = await aiClient().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 500,
    // The graph is someone else's source code read into a shape. Asking the
    // provider not to keep it is written down rather than assumed.
    store: false,
    messages: [
      { role: "system", content: EXPLAIN_SYSTEM },
      { role: "user", content: prompt },
    ],
  });

  const body = response.choices[0]?.message.content?.trim() ?? "";
  if (body === "") throw new Error("The model answered with nothing.");
  return body;
}

async function explainSubject(subject: Subject): Promise<Explanation> {
  const supabase = createServerSupabaseClient();

  // Read first, decide second: a stale answer is still worth showing, and the
  // cache is the only place the old one is.
  const cached = await readCached(supabase, subject);

  // Staleness wins over a hit. What was cached was written from the commit the
  // run read, and the reader has to be told the repository is past it — that is
  // the whole reason the hash is checked on every ask rather than once.
  if (subject.stale) {
    return { status: "stale", body: cached, model: MODEL };
  }

  if (cached !== null) {
    return { status: "explained", body: cached, cached: true, model: MODEL };
  }

  const body = await askModel(subject.prompt);
  await writeCached(supabase, subject, body);
  return { status: "explained", body, cached: false, model: MODEL };
}

export const explainFile = traceable(
  async (input: FileExplainInput): Promise<Explanation> =>
    explainSubject({
      analysisId: input.analysisId,
      organizationId: input.organizationId,
      fileId: input.fileId,
      subjectKind: "file",
      path: input.facts.path,
      contentHash: input.contentHash,
      promptVersion: FILE_PROMPT_VERSION,
      stale: input.stale,
      prompt: filePrompt(input.facts),
    }),
  { name: "explain-file" },
);

export const explainFolder = traceable(
  async (input: FolderExplainInput): Promise<Explanation> =>
    explainSubject({
      analysisId: input.analysisId,
      organizationId: input.organizationId,
      fileId: null,
      subjectKind: "folder",
      path: input.facts.path,
      contentHash: input.contentHash,
      promptVersion: FOLDER_PROMPT_VERSION,
      stale: input.stale,
      prompt: folderPrompt(input.facts),
    }),
  { name: "explain-folder" },
);
