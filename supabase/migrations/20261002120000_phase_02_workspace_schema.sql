-- Phase 2 — the workspace schema.
--
-- Every table below belongs to an organization, and who may read a row is a
-- database policy rather than a clause the application remembers to add. The
-- organization is read off the token Clerk mints for Supabase, so the claim the
-- database checks is the same one the interface is showing.

-- The claim, in one place. `auth.jwt()` is the verified token, never something
-- the caller supplies. Wrapping it means Postgres evaluates it once per
-- statement and every policy agrees on where the organization lives.
create or replace function public.request_org_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'org_id', '');
$$;

-- Policies run as `authenticated`, so that role needs to execute this and
-- nobody else does. Revoking from PUBLIC also keeps it off the API surface for
-- `anon`.
revoke execute on function public.request_org_id() from public;
grant execute on function public.request_org_id() to authenticated;

-- The organization, mirrored from the identity provider. Rows are written by
-- the identity provider's side, so there is a read policy and deliberately no
-- write policy: the API can see the organization it is already in.
create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- A repository, one row per repository per organization. Re-running it later
-- adds an analysis, not another project, which is what keeps a pasted URL from
-- becoming a duplicate.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  repo_url text not null,
  default_branch text,
  created_at timestamptz not null default now(),
  unique (organization_id, repo_url)
);

-- One run against a project: which commit it read, what state it reached, and
-- the counts the dashboard lists. `stage` is free text because the stage names
-- are application knowledge, not a fact about the repository.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed')),
  stage text,
  stage_message text,
  error_stage text,
  error_message text,
  commit_sha text,
  framework text,
  file_count integer,
  edge_count integer,
  route_count integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- A parsed file. `directory` is stored rather than derived so grouping by
-- folder never depends on string surgery at read time.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  path text not null,
  directory text not null,
  language text,
  lines integer not null default 0,
  content_hash text not null,
  fan_in integer not null default 0,
  fan_out integer not null default 0,
  unique (analysis_id, path)
);

-- A resolved import. An edge exists because the parser resolved a real import
-- to a real file; nothing here is inferred.
create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  from_file_id uuid not null references public.files (id) on delete cascade,
  to_file_id uuid not null references public.files (id) on delete cascade,
  kind text not null check (kind in ('import', 're-export', 'dynamic', 'require')),
  unique (analysis_id, from_file_id, to_file_id, kind)
);

-- A route recovered from a file by an adapter. `method` is nullable because a
-- Next.js page route has no method; the index below treats "no method" as its
-- own value so the same route is never stored twice.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  method text,
  path text not null,
  created_at timestamptz not null default now()
);

-- A cached explanation. The cache key is the content of the thing explained,
-- so a changed file misses rather than serving a stale paragraph. The model and
-- prompt version are part of the key so re-pinning one only invalidates itself.
create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid references public.files (id) on delete cascade,
  subject_kind text not null check (subject_kind in ('file', 'folder')),
  subject text not null,
  content_hash text not null,
  model text not null,
  prompt_version text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (analysis_id, subject_kind, subject, content_hash, model, prompt_version)
);

-- What kind of file this is, and where that answer came from. Kept apart from
-- `files` because a role is a separate question with its own provenance: a
-- convention matched it, or a model labelled it.
create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  role text not null,
  source text not null check (source in ('convention', 'classification')),
  created_at timestamptz not null default now(),
  unique (file_id)
);

-- A fact about the edge list. Four kinds, all computed, none of them a verdict.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  kind text not null check (kind in ('cycle', 'unimported', 'high_fan_in', 'long_file')),
  file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Postgres does not index the referencing side of a foreign key, and every one
-- of these is walked on cascade delete and read under an organization filter.
create index projects_organization_idx on public.projects (organization_id);
create index analyses_organization_created_idx on public.analyses (organization_id, created_at desc);
create index analyses_project_idx on public.analyses (project_id);
create index files_organization_idx on public.files (organization_id);
create index files_analysis_idx on public.files (analysis_id);
create index edges_organization_idx on public.edges (organization_id);
create index edges_analysis_idx on public.edges (analysis_id);
create index edges_from_file_idx on public.edges (from_file_id);
create index edges_to_file_idx on public.edges (to_file_id);
create index routes_organization_idx on public.routes (organization_id);
create index routes_analysis_idx on public.routes (analysis_id);
create index routes_file_idx on public.routes (file_id);
create unique index routes_analysis_path_idx
  on public.routes (analysis_id, file_id, path, coalesce(method, ''));
create index explanations_organization_idx on public.explanations (organization_id);
create index explanations_analysis_idx on public.explanations (analysis_id);
create index explanations_file_idx on public.explanations (file_id);
create index file_roles_organization_idx on public.file_roles (organization_id);
create index file_roles_analysis_idx on public.file_roles (analysis_id);
create index insights_organization_idx on public.insights (organization_id);
create index insights_analysis_idx on public.insights (analysis_id);

-- Row-level security is the default posture, not a per-table decision. The
-- organization on the row has to equal the organization on the token, for
-- reads and for writes alike, so a query needs no `where` clause to return the
-- right rows — and one that lacks it still cannot return the wrong ones.
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

create policy "organizations: the one you are in" on public.organizations
  for select to authenticated
  using (id = (select public.request_org_id()));

create policy "projects: own organization only" on public.projects
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "analyses: own organization only" on public.analyses
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "files: own organization only" on public.files
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "edges: own organization only" on public.edges
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "routes: own organization only" on public.routes
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "explanations: own organization only" on public.explanations
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "file_roles: own organization only" on public.file_roles
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

create policy "insights: own organization only" on public.insights
  for all to authenticated
  using (organization_id = (select public.request_org_id()))
  with check (organization_id = (select public.request_org_id()));

-- Reachable through the API only as the signed-in role, and never anonymously.
-- RLS decides which rows; these grants decide whether the table is reachable at
-- all, which is a different question.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.projects,
  public.analyses,
  public.files,
  public.edges,
  public.routes,
  public.explanations,
  public.file_roles,
  public.insights
to authenticated;
grant select on public.organizations to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

revoke all on
  public.organizations,
  public.projects,
  public.analyses,
  public.files,
  public.edges,
  public.routes,
  public.explanations,
  public.file_roles,
  public.insights
from anon;
alter default privileges in schema public revoke all on tables from anon;

-- The one failure mode that must be impossible rather than unlikely is a table
-- with row-level security switched off, because it returns every organization's
-- rows and looks completely healthy. Any migration that lands such a table
-- fails here instead.
do $$
declare
  unguarded text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into unguarded
    from pg_tables
   where schemaname = 'public'
     and not rowsecurity;

  if unguarded is not null then
    raise exception 'Row-level security is not enabled for: %', unguarded;
  end if;
end
$$;
