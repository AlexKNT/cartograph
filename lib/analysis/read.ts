/**
 * Reading an analysis back: the row, and the graph it stored.
 *
 * Server side, because that is where the database client belongs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import { createServerSupabaseClient } from "../supabase/server.ts";
import type { AnalysisDetail, EdgeRecord, FileRecord } from "../supabase/types.ts";
import { parsedEdges, parsedFiles, type PathEdge } from "./rows.ts";

/** A read that names something by id: it can also come back with nothing there. */
export type RecordLoad<T> =
  | { kind: "found"; value: T }
  | { kind: "missing" }
  | { kind: "unreadable"; message: string };

/** A read of what is inside a row that is already known to exist. */
export type ReadLoad<T> =
  | { kind: "found"; value: T }
  | { kind: "unreadable"; message: string };

/** Under PostgREST's own row cap, so a page is full rather than truncated. */
const PAGE = 500;

/**
 * The clock, read in server code and passed down as a value.
 *
 * A render is supposed to be a function of what it was given, and "the time" is
 * not one of those — which is what the rule against reading it inside a
 * component is protecting. Judging staleness is arithmetic over this number.
 */
export function serverNow(): number {
  return Date.now();
}

const ANALYSIS_COLUMNS =
  "id, status, stage, stage_message, error_stage, error_message, commit_sha, framework, " +
  "file_count, edge_count, route_count, imports_seen, imports_resolved, imports_unresolved, " +
  "imports_pruned, started_at, finished_at, created_at, project:projects ( repo_url )";

const FILE_COLUMNS = "id, path, directory, lines, content_hash, bytes, fan_in, fan_out";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the rows a page at a time. PostgREST answers with a bounded page and a
 * real repository has more files than that, so paging is not an optimisation —
 * a truncated read here would be a map quietly missing its edges.
 *
 * Ordered, because paging by offset over an unordered query can serve the same
 * row twice and drop another.
 */
async function readFileRows(
  supabase: SupabaseClient,
  analysisId: string,
): Promise<FileRecord[]> {
  const rows: FileRecord[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("files")
      .select(FILE_COLUMNS)
      .eq("analysis_id", analysisId)
      .order("path")
      .range(from, from + PAGE - 1)
      .overrideTypes<FileRecord[], { merge: false }>();

    if (error !== null) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function readEdgeRows(
  supabase: SupabaseClient,
  analysisId: string,
): Promise<EdgeRecord[]> {
  const rows: EdgeRecord[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("edges")
      .select("from_file_id, to_file_id, kind")
      .eq("analysis_id", analysisId)
      .order("from_file_id")
      .order("to_file_id")
      .order("kind")
      .range(from, from + PAGE - 1)
      .overrideTypes<EdgeRecord[], { merge: false }>();

    if (error !== null) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** A row that is not a uuid is a URL nobody could have meant, not a query. */
export async function readAnalysis(id: string): Promise<RecordLoad<AnalysisDetail>> {
  if (!UUID.test(id)) return { kind: "missing" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<AnalysisDetail, { merge: false }>();

  if (error !== null) return { kind: "unreadable", message: error.message };
  return data === null ? { kind: "missing" } : { kind: "found", value: data };
}

export interface StoredGraph {
  files: ParsedFile[];
  edges: ImportEdge[];
}

export async function readGraph(analysis: AnalysisDetail): Promise<ReadLoad<StoredGraph>> {
  const supabase = createServerSupabaseClient();

  try {
    const fileRows = await readFileRows(supabase, analysis.id);
    const edgeRows = await readEdgeRows(supabase, analysis.id);

    const pathById = new Map(fileRows.map((row) => [row.id, row.path]));
    const pathEdges: PathEdge[] = edgeRows.map((row) => {
      const from = pathById.get(row.from_file_id);
      const to = pathById.get(row.to_file_id);
      // The foreign keys make this impossible; if it happens the read is wrong,
      // and dropping the edge would hide it.
      if (from === undefined || to === undefined) {
        throw new Error(`Edge ${row.from_file_id} -> ${row.to_file_id} names a file that was not read.`);
      }
      return { from, to, kind: row.kind };
    });

    const files = parsedFiles(fileRows);
    const edges = parsedEdges(pathEdges);

    // What the run counted, against what came back. A read that lost rows — to
    // a page limit nobody told us about, say — would otherwise draw a clean,
    // confident, incomplete map.
    if (analysis.file_count !== null && files.length !== analysis.file_count) {
      throw new Error(`Read ${files.length} of ${analysis.file_count} files.`);
    }
    if (analysis.edge_count !== null && edges.length !== analysis.edge_count) {
      throw new Error(`Read ${edges.length} of ${analysis.edge_count} edges.`);
    }

    return { kind: "found", value: { files, edges } };
  } catch (error) {
    return {
      kind: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
