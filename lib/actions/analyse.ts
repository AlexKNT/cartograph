"use server";

import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAnalysis } from "@/lib/analysis/run";
import { parseRepositoryUrl, type RepositoryRef } from "@/lib/analysis/url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// A "use server" module may only export async functions, so the shapes here
// stay private and the form derives them from what these return.

type AnalyseState = { status: "idle" } | { status: "error"; message: string };

interface ProjectRow {
  id: string;
}

/** The project this organization already has for a repository, if any. */
async function findProject(
  supabase: SupabaseClient,
  url: string,
): Promise<ProjectRow | null> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("repo_url", url)
    .maybeSingle()
    .overrideTypes<ProjectRow, { merge: false }>();

  return data ?? null;
}

/** Any analysis of a project, which is what makes a second paste a redirect. */
async function existingAnalysis(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("analyses")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<{ id: string }, { merge: false }>();

  return data?.id ?? null;
}

async function projectFor(
  supabase: SupabaseClient,
  organizationId: string,
  url: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const found = await findProject(supabase, url);
  if (found !== null) return { ok: true, id: found.id };

  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: organizationId, repo_url: url })
    .select("id")
    .overrideTypes<ProjectRow[], { merge: false }>();

  if (error === null && data !== null && data.length === 1) {
    return { ok: true, id: data[0].id };
  }

  // The unique key on (organization, url) is what turns a second paste, or a
  // double submit, into the project that is already there rather than another.
  const again = await findProject(supabase, url);
  if (again !== null) return { ok: true, id: again.id };

  return { ok: false, message: error?.message ?? "Could not record the repository." };
}

async function startAnalysis(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string,
  ref: RepositoryRef,
): Promise<string> {
  const { data, error } = await supabase
    .from("analyses")
    .insert({ organization_id: organizationId, project_id: projectId, status: "queued" })
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();

  if (error !== null || data === null || data.length !== 1) {
    throw new Error(`Could not start the analysis: ${error?.message ?? "no row came back"}`);
  }

  const analysisId = data[0].id;

  // The run outlives the response that asked for it — there is no queue to hand
  // it to, and the progress page needs to exist before the work does.
  after(() =>
    runAnalysis({ analysisId, projectId, organizationId, ref }).catch((failure: unknown) => {
      console.error(failure instanceof Error ? failure.message : String(failure));
    }),
  );

  return analysisId;
}

export async function analyseRepository(
  _previous: AnalyseState,
  formData: FormData,
): Promise<AnalyseState> {
  const { orgId } = await auth();
  if (orgId === undefined || orgId === null) {
    return { status: "error", message: "This session has no organization to file an analysis under." };
  }

  const parsed = parseRepositoryUrl(String(formData.get("url") ?? ""));
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = createServerSupabaseClient();
  const ref = parsed.ref;

  const project = await projectFor(supabase, orgId, ref.url);
  if (!project.ok) return { status: "error", message: project.message };

  // One analysis per repository: pasting a URL that has already been analysed
  // opens that analysis. Running it again is a decision made from there.
  const existing = await existingAnalysis(supabase, project.id);
  if (existing !== null) redirect(`/analysis/${existing}`);

  let analysisId: string;
  try {
    analysisId = await startAnalysis(supabase, orgId, project.id, ref);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  redirect(`/analysis/${analysisId}`);
}

export async function reRunAnalysis(analysisId: string): Promise<void> {
  const { orgId } = await auth();
  if (orgId === undefined || orgId === null) redirect("/dashboard");

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("analyses")
    .select("id, project:projects ( id, repo_url )")
    .eq("id", analysisId)
    .maybeSingle()
    .overrideTypes<{ id: string; project: { id: string; repo_url: string } | null }, { merge: false }>();

  const project = data?.project ?? null;
  if (project === null) notFound();

  const parsed = parseRepositoryUrl(project.repo_url);
  if (!parsed.ok) throw new Error(`Stored repository URL is unreadable: ${parsed.message}`);

  const started = await startAnalysis(supabase, orgId, project.id, parsed.ref);
  redirect(`/analysis/${started}`);
}
