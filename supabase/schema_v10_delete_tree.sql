-- =============================================================================
-- Avrico Estates — SCHEMA v10: permanently delete a tree and ALL its records
-- So a removed tree frees its position and can be re-registered fresh.
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

create or replace function public.delete_tree_cascade(_tree_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Only owners and managers can delete trees';
  end if;

  delete from public.tree_inspections  where tree_id = _tree_id;
  delete from public.tree_treatments   where tree_id = _tree_id;
  delete from public.tree_photos       where tree_id = _tree_id;
  delete from public.tree_logs         where tree_id = _tree_id;
  delete from public.tree_replacements where tree_id = _tree_id;

  -- keep any tasks/produce that referenced it, just unlink them
  update public.tasks   set tree_id = null where tree_id = _tree_id;
  update public.produce set tree_id = null where tree_id = _tree_id;

  delete from public.trees where id = _tree_id;
end $$;

grant execute on function public.delete_tree_cascade(uuid) to authenticated;

-- =============================================================================
-- DONE.
-- =============================================================================
