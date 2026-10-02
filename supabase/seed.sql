-- Phase 2 seed.
--
-- Nothing in the application creates a real analysis yet, so this is what the
-- dashboard has to list, and what the acceptance check has to switch between.
--
-- The organization ids below are this development instance's Clerk
-- organizations ("testing" and "atlas"). That is the point of the mirror table:
-- it is what makes the foreign key — and therefore the cascade delete — real
-- rather than nominal. Delete this file once analyses are created for real.
--
-- Idempotent: fixed ids with an upsert, so applying it twice changes nothing.

insert into public.organizations (id, name) values
  ('org_3K9BhWlsAlwU6idjefmGfxZlDOF', 'testing'),
  ('org_3K9EQMunWj2lry4CECkuIOOXU0n', 'atlas')
on conflict (id) do update set name = excluded.name;

insert into public.projects (id, organization_id, repo_url, default_branch) values
  ('a0000000-0000-4000-8000-000000000001', 'org_3K9BhWlsAlwU6idjefmGfxZlDOF', 'https://github.com/vercel/next.js', 'canary'),
  ('a0000000-0000-4000-8000-000000000002', 'org_3K9BhWlsAlwU6idjefmGfxZlDOF', 'https://github.com/supabase/supabase', 'master'),
  ('a0000000-0000-4000-8000-000000000003', 'org_3K9EQMunWj2lry4CECkuIOOXU0n', 'https://github.com/facebook/react', 'main'),
  ('a0000000-0000-4000-8000-000000000004', 'org_3K9EQMunWj2lry4CECkuIOOXU0n', 'https://github.com/vercel/swr', 'main')
on conflict (id) do nothing;

insert into public.analyses (
  id, organization_id, project_id, status, stage, stage_message, error_stage, error_message,
  commit_sha, framework, file_count, edge_count, route_count, started_at, finished_at, created_at
) values
  (
    'b0000000-0000-4000-8000-000000000001',
    'org_3K9BhWlsAlwU6idjefmGfxZlDOF',
    'a0000000-0000-4000-8000-000000000001',
    'ready', 'store', null, null, null,
    '9f2c1ad4b1e04c3f8a7d6b5e4c3a2b1d0e9f8a7c', 'nextjs', 2841, 9032, 142,
    now() - interval '2 days 3 minutes', now() - interval '2 days', now() - interval '2 days 3 minutes'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'org_3K9BhWlsAlwU6idjefmGfxZlDOF',
    'a0000000-0000-4000-8000-000000000002',
    'failed', 'fetch', null, 'fetch', 'GitHub returned 404 for this repository.',
    null, null, null, null, null,
    now() - interval '5 hours', now() - interval '5 hours', now() - interval '5 hours'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'org_3K9EQMunWj2lry4CECkuIOOXU0n',
    'a0000000-0000-4000-8000-000000000003',
    'ready', 'store', null, null, null,
    '4b1a2c3d4e5f60718293a4b5c6d7e8f901234567', 'react', 1620, 4188, 0,
    now() - interval '1 day 12 minutes', now() - interval '1 day', now() - interval '1 day 12 minutes'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'org_3K9EQMunWj2lry4CECkuIOOXU0n',
    'a0000000-0000-4000-8000-000000000004',
    'running', 'parse', '1,204 of 3,988 files', null, null,
    'c7d8e9f01a2b3c4d5e6f708192a3b4c5d6e7f809', null, null, null, null,
    now() - interval '3 minutes', null, now() - interval '3 minutes'
  )
on conflict (id) do nothing;
