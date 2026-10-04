/**
 * Reading an analysis back: the row, and the graph it stored.
 *
 * Server side, because that is where the database client belongs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportEdge, ParsedFile } from "../parser/types.ts";
import { createServerSupabaseClient } from "../supabase/server.ts";
import type {
  AnalysisDetail,
  EdgeRecord,
  FileRecord,
  RoleRecord,
  RouteRecord,
  StoredRoute,
} from "../supabase/types.ts";
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
  "imports_pruned, started_at, finished_at, created_at, project:projects ( repo_url, default_branch )";

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

async function readRoleRows(
  supabase: SupabaseClient,
  analysisId: string,
): Promise<RoleRecord[]> {
  const rows: RoleRecord[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("file_roles")
      .select("file_id, role")
      .eq("analysis_id", analysisId)
      .order("file_id")
      .range(from, from + PAGE - 1)
      .overrideTypes<RoleRecord[], { merge: false }>();

    if (error !== null) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function readRouteRows(
  supabase: SupabaseClient,
  analysisId: string,
): Promise<RouteRecord[]> {
  const rows: RouteRecord[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("routes")
      .select("file_id, method, path")
      .eq("analysis_id", analysisId)
      .order("path")
      .order("method")
      .range(from, from + PAGE - 1)
      .overrideTypes<RouteRecord[], { merge: false }>();

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
  /** The convention role of each file, by path. */
  roles: Record<string, string>;
  /** Routes recovered exactly, resolved back to file paths. */
  routes: StoredRoute[];
}

export async function readGraph(analysis: AnalysisDetail): Promise<ReadLoad<StoredGraph>> {
  const supabase = createServerSupabaseClient();

  try {
    const fileRows = await readFileRows(supabase, analysis.id);
    const edgeRows = await readEdgeRows(supabase, analysis.id);
    const roleRows = await readRoleRows(supabase, analysis.id);
    const routeRows = await readRouteRows(supabase, analysis.id);

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

    const roles: Record<string, string> = {};
    for (const row of roleRows) {
      const path = pathById.get(row.file_id);
      // The foreign key makes this impossible; if it happens the read is wrong,
      // and dropping the role would hide it.
      if (path === undefined) throw new Error(`Role names a file that was not read.`);
      roles[path] = row.role;
    }

    const routes: StoredRoute[] = routeRows.map((row) => {
      const file = pathById.get(row.file_id);
      if (file === undefined) throw new Error(`Route names a file that was not read.`);
      return { file, method: row.method, route: row.path };
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
    if (analysis.route_count !== null && routes.length !== analysis.route_count) {
      throw new Error(`Read ${routes.length} of ${analysis.route_count} routes.`);
    }

    return { kind: "found", value: { files, edges, roles, routes } };
  } catch (error) {
    return {
      kind: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One thing a file is connected to, and how. */
export interface Neighbour {
  path: string;
  kinds: string[];
}

/** A file's place in the graph: the row, and every neighbour on both sides. */
export interface FileSubject {
  id: string;
  path: string;
  lines: number;
  contentHash: string;
  role: string | null;
  /** What it imports, in path order. */
  imports: Neighbour[];
  /** What imports it, in path order. */
  importers: Neighbour[];
}

/** PostgREST answers with a bounded URL, so an `in` list is sent in chunks. */
const NAME_CHUNK = 200;

async function pathsFor(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();

  for (let index = 0; index < ids.length; index += NAME_CHUNK) {
    const chunk = ids.slice(index, index + NAME_CHUNK);
    const { data, error } = await supabase
      .from("files")
      .select("id, path")
      .in("id", chunk)
      .overrideTypes<{ id: string; path: string }[], { merge: false }>();

    if (error !== null) throw new Error(`Could not read the neighbouring files: ${error.message}`);
    for (const row of data) paths.set(row.id, row.path);
  }

  return paths;
}

/**
 * One side of a file's edges, paged for the same reason the whole-graph read
 * is: PostgREST bounds a response, and a hub file's neighbours can pass that.
 */
async function readNeighbourEdges(
  supabase: SupabaseClient,
  analysisId: string,
  side: "imports" | "importers",
  fileId: string,
): Promise<{ other: string; kind: string }[]> {
  const column = side === "imports" ? "from_file_id" : "to_file_id";
  const rows: { other: string; kind: string }[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("edges")
      .select("from_file_id, to_file_id, kind")
      .eq("analysis_id", analysisId)
      .eq(column, fileId)
      .order("from_file_id")
      .order("to_file_id")
      .order("kind")
      .range(from, from + PAGE - 1)
      .overrideTypes<
        { from_file_id: string; to_file_id: string; kind: string }[],
        { merge: false }
      >();

    if (error !== null) throw new Error(`Could not read the edges: ${error.message}`);
    for (const row of data) {
      rows.push({
        other: side === "imports" ? row.to_file_id : row.from_file_id,
        kind: row.kind,
      });
    }
    if (data.length < PAGE) return rows;
  }
}

/** The edges gathered into one entry per neighbour, in path order. */
function neighbours(
  edges: readonly { other: string; kind: string }[],
  pathById: ReadonlyMap<string, string>,
): Neighbour[] {
  const kinds = new Map<string, Set<string>>();

  for (const edge of edges) {
    const path = pathById.get(edge.other);
    // The foreign keys make this impossible; if it happens the read is wrong,
    // and dropping the neighbour would hide it.
    if (path === undefined) throw new Error("An edge names a file that was not read.");
    const set = kinds.get(path);
    if (set === undefined) kinds.set(path, new Set([edge.kind]));
    else set.add(edge.kind);
  }

  return [...kinds.entries()]
    .map(([path, set]) => ({ path, kinds: [...set].sort() }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
}

/**
 * What explaining one file needs, and no more: the row, its role, and both
 * directions of its edges named by path. Reading the whole graph for a click
 * would make a cached explanation as slow as the first one.
 */
export async function readFileSubject(
  analysisId: string,
  path: string,
): Promise<RecordLoad<FileSubject>> {
  const supabase = createServerSupabaseClient();

  try {
    const { data: file, error } = await supabase
      .from("files")
      .select("id, path, lines, content_hash")
      .eq("analysis_id", analysisId)
      .eq("path", path)
      .maybeSingle()
      .overrideTypes<
        { id: string; path: string; lines: number; content_hash: string },
        { merge: false }
      >();

    if (error !== null) return { kind: "unreadable", message: error.message };
    if (file === null) return { kind: "missing" };

    const outgoing = await readNeighbourEdges(supabase, analysisId, "imports", file.id);
    const incoming = await readNeighbourEdges(supabase, analysisId, "importers", file.id);

    const pathById = await pathsFor(supabase, [
      ...new Set([...outgoing, ...incoming].map((edge) => edge.other)),
    ]);

    const { data: role, error: roleError } = await supabase
      .from("file_roles")
      .select("role")
      .eq("file_id", file.id)
      .maybeSingle()
      .overrideTypes<{ role: string }, { merge: false }>();

    if (roleError !== null) return { kind: "unreadable", message: roleError.message };

    return {
      kind: "found",
      value: {
        id: file.id,
        path: file.path,
        lines: file.lines,
        contentHash: file.content_hash,
        role: role?.role ?? null,
        imports: neighbours(outgoing, pathById),
        importers: neighbours(incoming, pathById),
      },
    };
  } catch (error) {
    return {
      kind: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
