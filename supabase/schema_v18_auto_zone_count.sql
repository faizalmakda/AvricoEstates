-- =============================================================================
-- Avrico Estates — SCHEMA v18: auto-grow a zone's expected tree count
-- When more trees are registered in a zone than its planned_tree_count, raise
-- the planned count to match, so a zone never shows more trees registered than
-- its total (e.g. "183 / 175"). The count only ever grows, never shrinks.
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

-- Keep a zone's planned_tree_count >= the number of active trees in it.
create or replace function public.bump_zone_planned_count()
returns trigger language plpgsql security definer
set search_path = public as $$
declare _active int;
begin
  -- On UPDATE, only act when something that changes the active-tree count moved.
  if TG_OP = 'UPDATE'
     and NEW.zone_id is not distinct from OLD.zone_id
     and NEW.archived is not distinct from OLD.archived
     and NEW.deleted_at is not distinct from OLD.deleted_at then
    return NEW;
  end if;

  if NEW.zone_id is null then return NEW; end if;

  select count(*) into _active
    from public.trees
    where zone_id = NEW.zone_id and archived = false and deleted_at is null;

  update public.zones
    set planned_tree_count = greatest(coalesce(planned_tree_count, 0), _active)
    where id = NEW.zone_id;

  return NEW;
end $$;

drop trigger if exists trg_bump_zone_planned_count on public.trees;
create trigger trg_bump_zone_planned_count
  after insert or update on public.trees
  for each row execute function public.bump_zone_planned_count();

-- One-time backfill: fix any zone that is already over its planned count.
update public.zones z
set planned_tree_count = greatest(coalesce(z.planned_tree_count, 0), sub.cnt)
from (
  select zone_id, count(*) as cnt
    from public.trees
    where archived = false and deleted_at is null
    group by zone_id
) sub
where sub.zone_id = z.id;

-- =============================================================================
-- DONE.
-- =============================================================================
