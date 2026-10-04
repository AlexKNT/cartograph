import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisProgressView } from "@/components/analysis/analysis-progress";
import { Explorer } from "@/components/graph/explorer";
import { tracingConfigured } from "@/lib/ai/client";
import { reRunAnalysis } from "@/lib/actions/analyse";
import { isStale, isUnfinished } from "@/lib/analysis/progress";
import { readAnalysis, readGraph, serverNow } from "@/lib/analysis/read";
import { repositoryName } from "@/lib/analysis/url";
import type { CoverageCounts } from "@/lib/graph/coverage";
import { foldFiles } from "@/lib/graph/fold";
import type { MapSummary, RepositoryFacts } from "@/lib/graph/types";
import type { AnalysisDetail } from "@/lib/supabase/types";

const ABSENT = "—";

/**
 * The map a finished run left behind, or why there isn't one. Read here rather
 * than inside the interface, because the database client belongs in server code.
 */
async function mapFor(analysis: AnalysisDetail, repository: string) {
  const graph = await readGraph(analysis);

  if (graph.kind === "unreadable") {
    return <p className="p-4 text-outgoing">Could not read the map: {graph.message}</p>;
  }

  const { files, edges, roles, routes } = graph.value;
  if (files.length === 0) {
    return (
      <p className="p-4 text-muted">
        No TypeScript or JavaScript files were found in this repository, so there is no map.
      </p>
    );
  }

  const fold = foldFiles(files, edges);
  const framework = analysis.framework ?? "none";

  const summary: MapSummary = {
    repository,
    framework,
    fileCount: files.length,
    nodeCount: fold.nodes.length,
    threshold: fold.threshold,
  };

  const facts: RepositoryFacts = {
    repository,
    framework,
    fileCount: files.length,
    importCount: analysis.imports_seen ?? 0,
    edgeCount: edges.length,
  };

  const coverage: CoverageCounts = {
    seen: analysis.imports_seen ?? 0,
    resolved: analysis.imports_resolved ?? 0,
    unresolved: analysis.imports_unresolved ?? 0,
    pruned: analysis.imports_pruned ?? 0,
  };

  return (
    <Explorer
      analysisId={analysis.id}
      tracing={tracingConfigured()}
      fold={fold}
      files={files}
      edges={edges}
      summary={summary}
      facts={facts}
      // Entry points are what the adapter names, and nothing stores them yet,
      // so the pane has none to take out of its orphan list.
      entryPoints={[]}
      roles={roles}
      routes={routes}
      coverage={coverage}
    />
  );
}

/**
 * A run and the map it left behind, on one route, because they are the same
 * thing at different times: while the run works, its stages appear here, and
 * when it finishes the progress view asks for this page again and gets the map.
 */
export default async function AnalysisPage({ params }: PageProps<"/analysis/[id]">) {
  const { id } = await params;
  const loaded = await readAnalysis(id);

  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "unreadable") {
    return <p className="p-4 text-outgoing">Could not read this analysis: {loaded.message}</p>;
  }

  const analysis = loaded.value;
  const repository =
    analysis.project === null ? ABSENT : repositoryName(analysis.project.repo_url);
  const stale = isStale(analysis.status, analysis.created_at, serverNow());
  // A live run does not offer a second run; one that has stopped — finished,
  // failed, or past the stale mark — does.
  const canReRun = !isUnfinished(analysis.status) || stale;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-baseline gap-3 border-b border-border px-2 py-1.5 font-mono text-[11px]">
        <Link href="/" className="text-muted hover:text-accent">
          dashboard
        </Link>
        <span>{repository}</span>
        {analysis.commit_sha !== null && (
          <span className="text-muted">{analysis.commit_sha.slice(0, 7)}</span>
        )}
        <span className="text-muted">{analysis.status}</span>

        {/* Re-running is a decision made from this analysis, never something a
            pasted URL gets you. Not offered while a run is live and moving: two
            runs of one repository is not what this button is for. */}
        {canReRun && (
          <form action={reRunAnalysis.bind(null, id)} className="ml-auto">
            <button
              type="submit"
              className="rounded border border-border px-1.5 text-[11px] text-muted hover:border-accent hover:text-foreground"
            >
              re-run
            </button>
          </form>
        )}
      </header>

      {analysis.status === "ready" && (await mapFor(analysis, repository))}

      {analysis.status === "failed" && (
        <div className="flex flex-col gap-1 p-4 font-mono text-[11px]">
          <span className="text-outgoing">failed in {analysis.error_stage ?? ABSENT}</span>
          <span>{analysis.error_message ?? "The run did not say why."}</span>
        </div>
      )}

      {isUnfinished(analysis.status) && (
        <>
          {/* Still subscribed: a slow run and a dead one look the same from a
              row, and only one of them will publish another stage. */}
          <AnalysisProgressView
            analysisId={id}
            stage={analysis.stage}
            message={analysis.stage_message}
          />
          {stale && (
            <p className="px-4 pb-4 font-mono text-[11px] text-outgoing">
              no stage change for over five minutes — if it stays like that, re-run
            </p>
          )}
        </>
      )}
    </div>
  );
}
