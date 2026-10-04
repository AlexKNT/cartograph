-- Phase 10 — explanations and labels.
--
-- Both tables already existed; this phase is the first thing to write in them.
-- One rule from the phase is worth a constraint rather than a prompt.

-- A role a model assigned is one of seven, and never a structural one. Page,
-- route and controller decide the route table and the entry-point colouring,
-- and a convention owns them: a model answering "controller" would be writing
-- structure by prose, which is the one thing this product refuses.
--
-- The prompt says the same thing. This says it where a change to the prompt
-- cannot reach, so the vocabulary cannot drift out from under the rail that
-- has to show it. Convention roles are untouched: they are the caller's own.
alter table public.file_roles
  add constraint file_roles_classification_vocabulary
  check (
    source = 'convention'
    or role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook')
  );
