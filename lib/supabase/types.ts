// The row shapes this app reads, written by hand and kept next to the schema
// they mirror: supabase/migrations/20261002120000_phase_02_workspace_schema.sql.
// A change to that migration changes this file, and the compiler then points at
// every read that needs to know.

// The check constraint on `analyses.status` is the source of truth for these
// four; anything else cannot be stored.
export type AnalysisStatus = "queued" | "running" | "ready" | "failed";

// One row of the dashboard list: an analysis and the repository it is of.
// Counts are null until a run has something to report, which is why they are
// rendered as an absent mark rather than a zero.
export type AnalysisSummary = {
  id: string;
  status: AnalysisStatus;
  stage: string | null;
  stage_message: string | null;
  error_message: string | null;
  framework: string | null;
  file_count: number | null;
  edge_count: number | null;
  route_count: number | null;
  created_at: string;
  project: { repo_url: string } | null;
};

/**
 * One analysis as its own page reads it: the run's state, what it read, and the
 * coverage counts a partial graph is described by. Everything here is a column
 * the run wrote; nothing is derived at read time.
 */
export type AnalysisDetail = {
  id: string;
  status: AnalysisStatus;
  stage: string | null;
  stage_message: string | null;
  error_stage: string | null;
  error_message: string | null;
  commit_sha: string | null;
  framework: string | null;
  file_count: number | null;
  edge_count: number | null;
  route_count: number | null;
  imports_seen: number | null;
  imports_resolved: number | null;
  imports_unresolved: number | null;
  imports_pruned: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  // The branch the run read, kept so a later explanation can ask GitHub for the
  // head of that branch rather than for the repository's default twice.
  project: { repo_url: string; default_branch: string | null } | null;
};

/** The `edges.kind` check constraint's vocabulary. */
export type StoredEdgeKind = "import" | "re-export" | "dynamic" | "require";

/** A row of `files`. */
export interface FileRecord {
  id: string;
  path: string;
  directory: string;
  lines: number;
  content_hash: string;
  bytes: number;
  fan_in: number;
  fan_out: number;
}

/** A row of `edges`, naming its files by id; the read layer resolves them to paths. */
export interface EdgeRecord {
  from_file_id: string;
  to_file_id: string;
  kind: string;
}

/** What a run writes into `files`. */
export interface NewFile {
  analysis_id: string;
  organization_id: string;
  path: string;
  directory: string;
  language: string;
  lines: number;
  content_hash: string;
  bytes: number;
  fan_in: number;
  fan_out: number;
}

/** What a run writes into `edges`. */
export interface NewEdge {
  analysis_id: string;
  organization_id: string;
  from_file_id: string;
  to_file_id: string;
  kind: StoredEdgeKind;
}

/** A role the adapter assigned by convention. Classification is a later phase. */
export interface NewRole {
  analysis_id: string;
  organization_id: string;
  file_id: string;
  role: string;
  source: "convention";
}

/** A route recovered from a file. `method` is null for a surface without one. */
export interface NewRoute {
  analysis_id: string;
  organization_id: string;
  file_id: string;
  method: string | null;
  path: string;
}

/** A row of `file_roles`, naming its file by id. */
export interface RoleRecord {
  file_id: string;
  role: string;
}

/** A row of `routes`, naming its file by id. */
export interface RouteRecord {
  file_id: string;
  method: string | null;
  path: string;
}

/** A route resolved back to the file it lives in, as the interface reads it. */
export interface StoredRoute {
  file: string;
  method: string | null;
  route: string;
}
