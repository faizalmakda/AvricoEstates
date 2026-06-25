-- =============================================================================
-- Avrico Estates — SCHEMA v5
-- Allow a task update (completion/evidence submission) to be deleted by the
-- person who made it (or an owner) — for fixing mistakes.
-- Run ONCE in Supabase SQL Editor, after the earlier schema files.
-- =============================================================================

drop policy if exists task_submissions_delete on public.task_submissions;
create policy task_submissions_delete on public.task_submissions
  for delete using (
    public.is_owner() or submitted_by = auth.uid()   -- owner, or the author fixing a mistake
  );

-- =============================================================================
-- DONE.
-- =============================================================================
