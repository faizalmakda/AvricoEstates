-- =============================================================================
-- Avrico Estates — SCHEMA v9: storage usage meter
-- Lets owners see how much of the storage limit is used (photos + backups).
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

create or replace function public.storage_usage()
returns table (total_bytes bigint, total_files bigint)
language sql security definer set search_path = storage, public as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as total_bytes,
         count(*)::bigint as total_files
  from storage.objects
$$;

grant execute on function public.storage_usage() to authenticated;

-- =============================================================================
-- DONE.
-- =============================================================================
