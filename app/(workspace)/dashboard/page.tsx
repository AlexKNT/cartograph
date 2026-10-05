import { auth } from "@clerk/nextjs/server";
import { AnalyseForm } from "@/components/analysis/analyse-form";
import { AnalysisTable } from "@/components/analysis/analysis-table";
import { serverNow } from "@/lib/analysis/read";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AnalysisSummary } from "@/lib/supabase/types";

const LIST_LIMIT = 50;

export default async function DashboardPage() {
  // Read from the session token, not from the browser: the identity provider is
  // never asked a question at render time, and the claim is there on first paint.
  const { orgId } = await auth();

  if (orgId === null) {
    return (
      <p className="p-4 text-muted">
        This session has no organization, so there is no workspace to list. Pick one from the
        switcher above.
      </p>
    );
  }

  const supabase = createServerSupabaseClient();

  // Deliberately no organization filter: the policy decides which rows come
  // back, so a query that returned another organization's row would be a policy
  // bug rather than something a `where` clause is hiding.
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, stage, stage_message, error_message, framework, file_count, edge_count, route_count, created_at, project:projects ( repo_url )",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT)
    .overrideTypes<AnalysisSummary[], { merge: false }>();

  if (error !== null) {
    return <p className="p-4 text-outgoing">Could not read analyses: {error.message}</p>;
  }

  const analyses = data ?? [];
  // One clock for the whole list, so every row is judged against the same moment.
  const now = serverNow();

  return (
    <div className="p-4">
      <header className="flex items-baseline gap-2">
        <h1 className="text-sm font-medium">Analyses</h1>
        <span className="font-mono text-[11px] text-muted">{analyses.length}</span>
      </header>

      <div className="mt-3">
        <AnalyseForm />
      </div>

      {analyses.length === 0 ? (
        <p className="mt-3 text-muted">
          This team hasn&apos;t mapped a repository yet. Paste the URL of a public repository
          and it will be fetched and parsed.
        </p>
      ) : (
        <AnalysisTable analyses={analyses} now={now} />
      )}
    </div>
  );
}
