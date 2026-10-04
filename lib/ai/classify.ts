/**
 * Labelling the files no framework convention identified.
 *
 * Same shape as an explanation — the trace opens, the cache is consulted
 * inside it, and only what is still unlabelled reaches the model — with one
 * difference: the answer is stored as a role, so a second pass over the same
 * files is a recorded run with no model call in it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";
import { CLASSIFIABLE_ROLE_IDS } from "../graph/rail.ts";
import { createServerSupabaseClient } from "../supabase/server.ts";
import { aiClient } from "./client.ts";
import { CLASSIFY_SYSTEM, MODEL, classifyPrompt } from "./prompts.ts";

/**
 * Files per call. Paths are short, so this is a token budget rather than a
 * guess at quality, and it keeps one enormous repository from becoming one
 * enormous request.
 */
const BATCH = 50;

/** PostgREST answers with a bounded URL, so an `in` list is sent in chunks. */
const ID_CHUNK = 200;

export interface UnidentifiedFile {
  id: string;
  path: string;
}

export interface ClassifyInput {
  analysisId: string;
  organizationId: string;
  files: readonly UnidentifiedFile[];
}

export interface Classified {
  /** Files the model was actually asked about. */
  asked: number;
  labelled: number;
  /** Files the model declined, or answered with something unusable. */
  skipped: number;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** Which of these files already carry a role, and therefore are not asked about. */
async function readLabelled(
  supabase: SupabaseClient,
  analysisId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  const labelled = new Set<string>();

  for (const chunk of chunks(ids, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("file_roles")
      .select("file_id")
      .eq("analysis_id", analysisId)
      .in("file_id", chunk)
      .overrideTypes<{ file_id: string }[], { merge: false }>();

    if (error !== null) throw new Error(`Could not read the file roles: ${error.message}`);
    for (const row of data) labelled.add(row.file_id);
  }

  return labelled;
}

/**
 * The model's answer, kept strictly: only paths that were asked about, and only
 * roles the rail can show. An invented path or an out-of-vocabulary role is
 * dropped rather than stored, because a role is what colours the map.
 */
function rolesFrom(content: string, batch: readonly UnidentifiedFile[]): { id: string; role: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The model did not answer with JSON.");
  }

  const roles = fieldOf(parsed, "roles");
  const byPath = new Map(batch.map((file) => [file.path, file.id]));
  const found: { id: string; role: string }[] = [];

  if (typeof roles !== "object" || roles === null) return found;

  for (const [path, role] of Object.entries(roles)) {
    const id = byPath.get(path);
    if (id === undefined) continue;
    if (typeof role !== "string" || !CLASSIFIABLE_ROLE_IDS.includes(role)) continue;
    found.push({ id, role });
  }
  return found;
}

async function askRoles(
  batch: readonly UnidentifiedFile[],
): Promise<{ id: string; role: string }[]> {
  const response = await aiClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1500,
    store: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: classifyPrompt(batch.map((file) => file.path)) },
    ],
  });

  return rolesFrom(response.choices[0]?.message.content ?? "", batch);
}

export const classifyFiles = traceable(
  async (input: ClassifyInput): Promise<Classified> => {
    const supabase = createServerSupabaseClient();

    const labelled = await readLabelled(
      supabase,
      input.analysisId,
      input.files.map((file) => file.id),
    );
    const unlabelled = input.files.filter((file) => !labelled.has(file.id));
    if (unlabelled.length === 0) return { asked: 0, labelled: 0, skipped: 0 };

    let written = 0;
    for (const batch of chunks(unlabelled, BATCH)) {
      const roles = await askRoles(batch);
      if (roles.length === 0) continue;

      const { error } = await supabase.from("file_roles").insert(
        roles.map((role) => ({
          organization_id: input.organizationId,
          analysis_id: input.analysisId,
          file_id: role.id,
          role: role.role,
          source: "classification",
        })),
      );
      if (error !== null) throw new Error(`Could not store the file roles: ${error.message}`);
      written += roles.length;
    }

    return { asked: unlabelled.length, labelled: written, skipped: unlabelled.length - written };
  },
  { name: "classify-files" },
);
