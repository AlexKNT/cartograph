"use server";

/**
 * Explaining what is selected.
 *
 * The whole of this is server side because two of its three parts can only be:
 * the rows the prompt is built from, and the check against GitHub. The client
 * names a subject and nothing more — every path that reaches the model is read
 * here, from the run's own rows, so a page cannot widen what an explanation is
 * allowed to talk about.
 */

import { auth } from "@clerk/nextjs/server";
import {
  explainFile,
  explainFolder,
  type ExplainOutcome,
  type Explanation,
} from "@/lib/ai/explain";
import type { FileFacts, FolderFacts } from "@/lib/ai/prompts";
import { readAnalysis, readFileSubject, readGraph } from "@/lib/analysis/read";
import { fileStaleness, repositoryStaleness, type Staleness } from "@/lib/analysis/staleness";
import { parseRepositoryUrl, type RepositoryRef } from "@/lib/analysis/url";
import { foldFiles, ownerIndex } from "@/lib/graph/fold";
import { contentHashOf } from "@/lib/parser/index";
import type { AnalysisDetail } from "@/lib/supabase/types";

/** An analysis that got as far as recording the commit it read. */
type AnsweredAnalysis = AnalysisDetail & { commit_sha: string };

function failed(message: string): ExplainOutcome {
  return { status: "failed", message };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reasonOf(staleness: Staleness): "file-changed" | "file-gone" | "repository-moved" {
  return staleness.kind === "current" ? "repository-moved" : staleness.kind;
}

/** The traced answer, read as the pane's own vocabulary. */
function outcomeOf(explanation: Explanation, staleness: Staleness): ExplainOutcome {
  if (explanation.status === "explained") {
    return {
      status: "explained",
      body: explanation.body,
      cached: explanation.cached,
      model: explanation.model,
    };
  }
  return {
    status: "stale",
    body: explanation.body,
    model: explanation.model,
    reason: reasonOf(staleness),
  };
}

/**
 * A folder's content hash: its members' own hashes, in path order. The folder
 * is the thing being explained, so what it is made of is what the cache key
 * should follow — a member changing changes the folder.
 */
function folderHash(paths: readonly string[], hashByPath: ReadonlyMap<string, string>): string {
  const content = paths
    .map((path) => `${path} ${hashByPath.get(path) ?? ""}`)
    .sort()
    .join("\n");
  return contentHashOf(Buffer.from(content, "utf8"));
}

async function explainOneFile(
  analysis: AnsweredAnalysis,
  organizationId: string,
  ref: RepositoryRef,
  branch: string | null,
  path: string,
): Promise<ExplainOutcome> {
  const loaded = await readFileSubject(analysis.id, path);
  if (loaded.kind === "missing") return failed("That file is not one this run kept.");
  if (loaded.kind === "unreadable") {
    return failed(`Could not read that file's place in the map: ${loaded.message}`);
  }

  const file = loaded.value;
  const staleness = await fileStaleness(
    ref,
    branch,
    analysis.commit_sha,
    file.path,
    file.contentHash,
  );

  const facts: FileFacts = {
    path: file.path,
    lines: file.lines,
    role: file.role,
    imports: file.imports,
    importers: file.importers,
  };

  const explanation = await explainFile({
    analysisId: analysis.id,
    organizationId,
    fileId: file.id,
    contentHash: file.contentHash,
    stale: staleness.kind !== "current",
    facts,
  });

  return outcomeOf(explanation, staleness);
}

async function explainOneFolder(
  analysis: AnsweredAnalysis,
  organizationId: string,
  ref: RepositoryRef,
  branch: string | null,
  path: string,
): Promise<ExplainOutcome> {
  const graph = await readGraph(analysis);
  if (graph.kind === "unreadable") {
    return failed(`Could not read the map: ${graph.message}`);
  }

  const { files, edges, roles } = graph.value;
  // The node is where the fold put the files, not the directory: a folder that
  // swallowed its small children is explained with them in it.
  const fold = foldFiles(files, edges);
  const node = fold.nodes.find((candidate) => candidate.id === path);
  if (node === undefined) return failed("That folder is not in this map.");

  const owners = ownerIndex(fold.nodes);
  const hashByPath = new Map(files.map((file) => [file.path, file.hash]));

  const pointingIn = new Set<string>();
  for (const edge of edges) {
    if (owners.get(edge.to) === node.id && owners.get(edge.from) !== node.id) {
      pointingIn.add(edge.from);
    }
  }

  const facts: FolderFacts = {
    path: node.id,
    files: node.files.map((file) => ({ path: file, role: roles[file] ?? null })),
    imports: [
      ...new Set(fold.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to)),
    ].sort(),
    importedBy: [
      ...new Set(fold.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from)),
    ].sort(),
    pointingIn: [...pointingIn].sort(),
  };

  const staleness = await repositoryStaleness(ref, branch, analysis.commit_sha);
  const explanation = await explainFolder({
    analysisId: analysis.id,
    organizationId,
    contentHash: folderHash(node.files, hashByPath),
    stale: staleness.kind !== "current",
    facts,
  });

  return outcomeOf(explanation, staleness);
}

/**
 * `subject` is a file path or a folder path, both of which are what the map
 * already draws: a file as the map names it, a folder as the node's id.
 */
export async function explainSubject(
  analysisId: string,
  kind: "file" | "folder",
  subject: string,
): Promise<ExplainOutcome> {
  const { orgId } = await auth();
  if (orgId === undefined || orgId === null) {
    return failed("This session has no organization to explain under.");
  }

  const loaded = await readAnalysis(analysisId);
  if (loaded.kind === "missing") return failed("That analysis is not here.");
  if (loaded.kind === "unreadable") {
    return failed(`Could not read this analysis: ${loaded.message}`);
  }

  const analysis = loaded.value;
  if (analysis.status !== "ready") return failed("This analysis has no map to explain yet.");
  if (analysis.project === null) return failed("This analysis does not name a repository.");

  const commitSha = analysis.commit_sha;
  if (commitSha === null) {
    return failed("This run did not record the commit it read, so nothing can be checked against it.");
  }

  const parsed = parseRepositoryUrl(analysis.project.repo_url);
  if (!parsed.ok) return failed(`Stored repository URL is unreadable: ${parsed.message}`);

  const ref = parsed.ref;
  const branch = analysis.project.default_branch;
  const answered: AnsweredAnalysis = { ...analysis, commit_sha: commitSha };

  try {
    return kind === "file"
      ? await explainOneFile(answered, orgId, ref, branch, subject)
      : await explainOneFolder(answered, orgId, ref, branch, subject);
  } catch (error) {
    // The check against GitHub is part of the answer: an explanation nobody can
    // tell is current is worth less than an error naming why.
    return failed(`Could not check this against the repository: ${errorText(error)}`);
  }
}
