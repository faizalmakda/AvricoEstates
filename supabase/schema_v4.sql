-- =============================================================================
-- Avrico Estates — SCHEMA v4
-- 1. Estimated cost on inventory requests
-- 2. "Last edited by / at" audit tracking across editable records
-- Run ONCE in Supabase SQL Editor, after schema.sql, schema_v2.sql, schema_v3.sql.
-- =============================================================================

-- 1) Estimated cost on requests ----------------------------------------------
alter table public.inventory_requests add column if not exists estimated_cost numeric;

-- 2) Audit columns ------------------------------------------------------------
-- Make sure each editable table has updated_at + updated_by.
alter table public.trees               add column if not exists updated_at timestamptz default now();
alter table public.trees               add column if not exists updated_by uuid references auth.users (id);
alter table public.tasks               add column if not exists updated_at timestamptz default now();
alter table public.tasks               add column if not exists updated_by uuid references auth.users (id);
alter table public.inventory           add column if not exists updated_at timestamptz default now();
alter table public.inventory           add column if not exists updated_by uuid references auth.users (id);
alter table public.zones               add column if not exists updated_at timestamptz default now();
alter table public.zones               add column if not exists updated_by uuid references auth.users (id);
alter table public.inventory_requests  add column if not exists updated_at timestamptz default now();
alter table public.inventory_requests  add column if not exists updated_by uuid references auth.users (id);

-- A trigger that stamps WHO changed a row and WHEN, automatically, on every
-- update — so the record is reliable no matter where the change came from.
create or replace function public.stamp_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end$$;

do $$
declare t text;
begin
  foreach t in array array['trees', 'tasks', 'inventory', 'zones', 'inventory_requests'] loop
    execute format('drop trigger if exists trg_stamp_%1$s on public.%1$s', t);
    execute format('create trigger trg_stamp_%1$s before update on public.%1$s
                    for each row execute function public.stamp_updated()', t);
  end loop;
end$$;

-- =============================================================================
-- DONE.
-- =============================================================================
