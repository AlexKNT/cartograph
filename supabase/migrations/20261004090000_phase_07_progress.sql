-- Phase 7 — the pipeline.
--
-- Two additions: what a run records about the graph it produced, and the
-- channel the progress page listens on. Nothing here changes who may read a
-- row; every policy from phase 2 still decides that.

-- The graph is partial whenever an import that belonged to this repository did
-- not become an edge. These three counts make that a subtraction at read time,
-- so the coverage figure is arithmetic on numbers the parser really produced
-- rather than an interpretation of them.
--
-- `imports_pruned` is the awkward one: the target exists in the repository but
-- the walk did not take it as a node (a pruned directory, or a file it
-- skipped). It is a hole in the map, unlike an import of a package or of a
-- stylesheet, which was never going to be a node.
alter table public.analyses
  add column imports_seen integer,
  add column imports_resolved integer,
  add column imports_unresolved integer,
  add column imports_pruned integer;

-- The parser counts bytes; a file's shape in the interface carries the number,
-- so it is stored. There is deliberately no default: a row written without it
-- should fail rather than claim a file is empty.
alter table public.files add column bytes integer not null default 0;
alter table public.files alter column bytes drop default;

-- One message per stage move, published from the table itself. Never a trigger
-- on the realtime machinery: what we publish is a fact about our own row.
--
-- The payload is the stage and its message — plus the status, because that is
-- how the page learns the run has finished. It is not the row: the page has
-- nothing to filter and nothing to interpret when it arrives.
--
-- The topic is `analysis:<id>`, spelled the same way in the policy below and in
-- the subscriber.
create or replace function public.publish_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'stage', new.stage,
      'message', new.stage_message,
      'status', new.status
    ),
    'progress',
    'analysis:' || new.id::text,
    true
  );
  return null;
end
$$;

-- Definer rights, so publishing is not subject to the subscription policy, and
-- no grant is needed: the executor refuses a direct call to a function that
-- returns `trigger`.
--
-- Fires only when the stage, its message or the status really changes, so an
-- update that merely lands the counts at the end of a stage stays quiet.
create trigger analyses_publish_progress
after update of stage, stage_message, status on public.analyses
for each row
when (
  old.stage is distinct from new.stage
  or old.stage_message is distinct from new.stage_message
  or old.status is distinct from new.status
)
execute function public.publish_analysis_progress();

-- The channel pattern is registered here, with the tables, because a channel
-- nobody may join is a channel whose messages go nowhere — and the symptom is a
-- progress page that simply never updates.
--
-- Who may subscribe is a policy for the same reason who may select is: another
-- organization's analysis is not subscribable. The topic names the analysis, so
-- the predicate reads that analysis's organization off the same claim the row
-- policies read.
--
-- Row-level security is already on for `realtime.messages` and that table
-- belongs to the realtime machinery, so a migration must not touch the setting:
-- Postgres checks ownership before it checks whether anything would change, and
-- the failure takes the rest of the migration with it.
create policy "analysis progress: own organization only"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'analysis:%'
  and exists (
    select 1
    from public.analyses
    where analyses.id::text = split_part(realtime.topic(), ':', 2)
      and analyses.organization_id = (select public.request_org_id())
  )
);
