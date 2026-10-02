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
