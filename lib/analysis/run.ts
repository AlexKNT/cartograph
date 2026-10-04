/**
 * One run: fetch, select, parse, store.
 *
 * Server side, and the only place the pipeline exists. It is not a queue and
 * has no worker — the request that started it is still holding it — so the one
 * thing it must never do is leave the row mid-parse without saying so. Every
 * way out writes the outcome, including the ones nobody planned for.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { coverageCounts } from "../graph/coverage.ts";
import { parseRepository } from "../parser/index.ts";
import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import { createServerSupabaseClient } from "../supabase/server.ts";
import type { NewEdge } from "../supabase/types.ts";
import { createWorkspace, fetchRepository, removeWorkspace } from "./fetch.ts";
import { edgeRows, fileRows } from "./rows.ts";
import type { RunStage } from "./progress.ts";
import type { RepositoryRef } from "./url.ts";

/** PostgREST returns a bounded page, and a repository has more files than that. */
const INSERT_CHUNK = 400;

export interface RunInput {
  analysisId: string;
  projectId: string;
  organizationId: string;
  ref: RepositoryRef;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

async function setStage(
  supabase: SupabaseClient,
  analysisId: string,
  stage: RunStage,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("analyses")
    .update({ status: "running", stage, stage_message: message })
    .eq("id", analysisId);

  if (error !== null) {
    throw new Error(`Could not record the ${stage} stage: ${error.message}`);
  }
}

async function storeFiles(
  supabase: SupabaseClient,
  analysisId: string,
  organizationId: string,
  files: readonly ParsedFile[],
): Promise<Map<string, string>> {
  const rows = fileRows(analysisId, organizationId, files);
  const idByPath = new Map<string, string>();

  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const chunk = rows.slice(index, index + INSERT_CHUNK);
    const { data, error } = await supabase
      .from("files")
      .insert(chunk)
      .select("id, path")
      .overrideTypes<{ id: string; path: string }[], { merge: false }>();

    if (error !== null) throw new Error(`Could not store files: ${error.message}`);

    // A short answer here would drop files out of the map without saying so, so
    // it is an error rather than something to carry on from.
    if (data === null || data.length !== chunk.length) {
      throw new Error(`Stored ${data?.length ?? 0} of ${chunk.length} files.`);
    }
    for (const row of data) idByPath.set(row.path, row.id);
  }

  return idByPath;
}

async function storeEdges(
  supabase: SupabaseClient,
  analysisId: string,
  organizationId: string,
  edges: readonly ImportEdge[],
  idByPath: ReadonlyMap<string, string>,
): Promise<void> {
  const rows: NewEdge[] = edgeRows(analysisId, organizationId, edges, idByPath);

  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const chunk = rows.slice(index, index + INSERT_CHUNK);
    const { error } = await supabase.from("edges").insert(chunk);
    if (error !== null) throw new Error(`Could not store edges: ${error.message}`);
  }
}

/**
 * Records the failure and why. If even that write fails there is nothing left
 * to do but say so: the dashboard's stale marker is what covers a row that
 * stopped without getting this far.
 */
async function failRun(
  supabase: SupabaseClient,
  analysisId: string,
  stage: RunStage,
  error: unknown,
): Promise<void> {
  const message = errorText(error);
  const { error: writeError } = await supabase
    .from("analyses")
    .update({
      status: "failed",
      error_stage: stage,
      error_message: message,
      stage_message: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (writeError !== null) {
    console.error(`Analysis ${analysisId} failed at ${stage}: ${message}`);
    console.error(`Could not record that failure: ${writeError.message}`);
  }
}

export async function runAnalysis(input: RunInput): Promise<void> {
  const supabase = createServerSupabaseClient();
  const workspace = await createWorkspace();
  let stage: RunStage = "fetch";

  try {
    const { error: startError } = await supabase
      .from("analyses")
      .update({
        status: "running",
        stage,
        stage_message: `downloading ${input.ref.owner}/${input.ref.repo}`,
        started_at: new Date().toISOString(),
      })
      .eq("id", input.analysisId);

    if (startError !== null) throw new Error(`Could not start the run: ${startError.message}`);

    const fetched = await fetchRepository(input.ref, workspace);

    stage = "select";
    await setStage(supabase, input.analysisId, stage, `unpacking ${fetched.commitSha.slice(0, 7)}`);

    stage = "parse";
    await setStage(supabase, input.analysisId, stage, `reading imports in ${count(fetched.files)} files`);
    const parsed = parseRepository(workspace.root);

    stage = "store";
    await setStage(
      supabase,
      input.analysisId,
      stage,
      `writing ${count(parsed.stats.filesParsed)} files and ${count(parsed.stats.edges)} edges`,
    );

    const idByPath = await storeFiles(
      supabase,
      input.analysisId,
      input.organizationId,
      parsed.files,
    );
    await storeEdges(supabase, input.analysisId, input.organizationId, parsed.edges, idByPath);

    const coverage = coverageCounts(parsed.coverage);
    const { error } = await supabase
      .from("analyses")
      .update({
        status: "ready",
        stage: null,
        stage_message: null,
        framework: parsed.repository.framework,
        commit_sha: fetched.commitSha,
        file_count: parsed.stats.filesParsed,
        edge_count: parsed.stats.edges,
        imports_seen: coverage.seen,
        imports_resolved: coverage.resolved,
        imports_unresolved: coverage.unresolved,
        imports_pruned: coverage.pruned,
        finished_at: new Date().toISOString(),
      })
      .eq("id", input.analysisId);

    if (error !== null) throw new Error(`Could not close the run: ${error.message}`);

    // The branch the archive came from, kept with the project so a later run has
    // something to compare the commit against.
    await supabase
      .from("projects")
      .update({ default_branch: fetched.defaultBranch })
      .eq("id", input.projectId);
  } catch (error) {
    await failRun(supabase, input.analysisId, stage, error);
  } finally {
    // Nothing of the repository outlives the run: the archive and the tree it
    // unpacked are both gone once the rows exist.
    await removeWorkspace(workspace);
  }
}
