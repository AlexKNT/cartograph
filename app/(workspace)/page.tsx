import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AnalysisSummary } from "@/lib/supabase/types";

// A paste-a-URL form belongs here, but there is nothing behind it to call yet,
// so this page stays a list until there is.
const LIST_LIMIT = 50;

const ABSENT = "—";

// The repository URL is GitHub and stored in canonical form, so the display
// name is a subtraction rather than a parse that can throw.
function repositoryName(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

// UTC, fixed width, no locale: the same row reads the same everywhere.
function timestamp(value: string | null): string {
  return value === null ? ABSENT : value.slice(0, 16).replace("T", " ");
}

// The palette carries one accent and one warning end. On this screen they mean
// live and failed — there are no edges here for direction to collide with.
function state(analysis: AnalysisSummary): { text: string; className: string } {
  switch (analysis.status) {
    case "failed":
      return { text: "failed", className: "text-outgoing" };
    case "running":
      return {
        text: analysis.stage === null ? "running" : `running · ${analysis.stage}`,
        className: "text-accent",
      };
    default:
      return { text: analysis.status, className: "text-muted" };
  }
}

function AnalysisRow({ analysis }: { analysis: AnalysisSummary }) {
  const { text, className } = state(analysis);
  // A failed run says where it stopped, and a live one says how far it has got.
  // Both belong on the row; neither belongs in a tooltip.
  const detail = analysis.error_message ?? analysis.stage_message;

  return (
    <tr className="align-baseline">
      <td className="border-b border-border py-1 pr-4 font-mono">
        {analysis.project === null ? ABSENT : repositoryName(analysis.project.repo_url)}
      </td>
      <td className={`border-b border-border py-1 pr-4 font-mono ${className}`}>{text}</td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.file_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.edge_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 pr-4 text-right font-mono text-muted">
        {analysis.route_count ?? ABSENT}
      </td>
      <td className="border-b border-border py-1 font-mono text-muted">
        {timestamp(analysis.created_at)}
        {detail !== null && <span className="ml-2">{detail}</span>}
      </td>
    </tr>
  );
}

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

  return (
    <div className="p-4">
      <header className="flex items-baseline gap-2">
        <h1 className="text-sm font-medium">Analyses</h1>
        <span className="font-mono text-[11px] text-muted">{analyses.length}</span>
      </header>

      {analyses.length === 0 ? (
        <p className="mt-3 text-muted">
          This team hasn&apos;t mapped a repository yet. Nothing is listed until one has been
          analysed.
        </p>
      ) : (
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="border-b border-border py-1 pr-4 font-normal">repository</th>
              <th className="border-b border-border py-1 pr-4 font-normal">state</th>
              <th className="border-b border-border py-1 pr-4 text-right font-normal">files</th>
              <th className="border-b border-border py-1 pr-4 text-right font-normal">edges</th>
              <th className="border-b border-border py-1 pr-4 text-right font-normal">routes</th>
              <th className="border-b border-border py-1 font-normal">started</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((analysis) => (
              <AnalysisRow key={analysis.id} analysis={analysis} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
