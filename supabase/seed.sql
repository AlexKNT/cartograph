-- The organizations this app knows about.
--
-- Sign-in and teams come from Clerk; this table is the mirror the foreign keys
-- point at, and nothing in the application writes it. The ids below are this
-- development instance's Clerk organizations ("testing" and "atlas"). That is
-- the point of the mirror: it is what makes the foreign key — and therefore the
-- cascade delete — real rather than nominal.
--
-- Idempotent: fixed ids with an upsert, so applying it twice changes nothing.
--
-- The projects and analyses this file used to seed are gone. A run creates both
-- for real now, and a seeded analysis of a repository someone then pastes would
-- be an analysis with no files behind it, standing in for the one they asked
-- for.

insert into public.organizations (id, name) values
  ('org_3K9BhWlsAlwU6idjefmGfxZlDOF', 'testing'),
  ('org_3K9EQMunWj2lry4CECkuIOOXU0n', 'atlas')
on conflict (id) do update set name = excluded.name;
