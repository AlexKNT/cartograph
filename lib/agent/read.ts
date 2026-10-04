/**
 * Reading one analysis on behalf of the agent's tools.
 *
 * The credential carries the asker's own token, so this read is subject to the
 * same policies as the map. The token and the credential are checked to agree
 * about the organization first: a mismatch means the read and the policy would
 * be talking about two different tenants, and the only safe answer is no.
 */

import { readAnalysis, readGraph } from "../analysis/read.ts";
import { repositoryName } from "../analysis/url.ts";
import { createSupabaseClientWithToken } from "../supabase/server.ts";
import { organizationFromToken, type AgentCredential } from "./credential.ts";
import type { AnalysisFacts } from "./tools.ts";

export type MintedRead =
  | { kind: "found"; facts: AnalysisFacts }
  | { kind: "unauthorised"; message: string }
  | { kind: "missing" }
  | { kind: "unready"; message: string }
  | { kind: "unreadable"; message: string };

export async function mintedRead(credential: AgentCredential): Promise<MintedRead> {
  const organizationId = organizationFromToken(credential.token);
  if (organizationId === null || organizationId !== credential.organizationId) {
    return { kind: "unauthorised", message: "The credential's token names a different organization." };
  }

  const supabase = createSupabaseClientWithToken(credential.token);

  const loaded = await readAnalysis(credential.analysisId, supabase);
  if (loaded.kind === "missing") return { kind: "missing" };
  if (loaded.kind === "unreadable") {
    return { kind: "unreadable", message: `Could not read this analysis: ${loaded.message}` };
  }

  const analysis = loaded.value;
  if (analysis.status !== "ready") {
    return { kind: "unready", message: `This analysis is ${analysis.status}, so there is no map to read.` };
  }

  const graph = await readGraph(analysis, supabase);
  if (graph.kind === "unreadable") {
    return { kind: "unreadable", message: `Could not read the map: ${graph.message}` };
  }

  const { files, edges, roles, routes } = graph.value;

  return {
    kind: "found",
    facts: {
      repository: analysis.project === null ? "unknown" : repositoryName(analysis.project.repo_url),
      framework: analysis.framework ?? "none",
      files,
      edges,
      roles,
      routes,
      coverage: {
        seen: analysis.imports_seen ?? 0,
        resolved: analysis.imports_resolved ?? 0,
        unresolved: analysis.imports_unresolved ?? 0,
        pruned: analysis.imports_pruned ?? 0,
      },
    },
  };
}
