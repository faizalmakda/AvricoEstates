-- =============================================================================
-- Avrico Estates — one-time backfill: set "Last inspection" on existing trees
-- from the inspections / status updates already recorded against them.
-- Safe to run more than once. Run in the Supabase SQL Editor.
-- =============================================================================

update public.trees t
set last_inspection_on = greatest(
  t.last_inspection_on,
  (select max(i.inspection_date)      from public.tree_inspections i where i.tree_id = t.id),
  (select max((l.created_at)::date)   from public.tree_logs        l where l.tree_id = t.id)
)
where exists (select 1 from public.tree_inspections i where i.tree_id = t.id)
   or exists (select 1 from public.tree_logs        l where l.tree_id = t.id);

-- =============================================================================
-- DONE. (greatest() ignores NULLs, so this only ever fills in or moves the date
-- forward — it never wipes an existing date.)
-- =============================================================================
