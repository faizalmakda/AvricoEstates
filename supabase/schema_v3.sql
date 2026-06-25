-- =============================================================================
-- Avrico Estates — SCHEMA v3
-- Inventory purchase requests (request -> approve -> purchase -> into stock)
-- Run ONCE in Supabase SQL Editor, after schema.sql and schema_v2.sql.
-- =============================================================================

create table if not exists public.inventory_requests (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid references public.inventory (id),   -- existing item (optional)
  item_name          text not null,                           -- what is being requested
  quantity           numeric not null check (quantity > 0),
  unit               text,
  reason             text,
  zone_id            uuid references public.zones (id),       -- for which block (optional)
  status             text not null default 'requested'
                       check (status in ('requested', 'approved', 'rejected', 'purchased', 'cancelled')),
  notes              text,                                    -- rejection reason / purchase note
  requested_by       uuid references auth.users (id),
  approved_by        uuid references auth.users (id),
  purchased_by       uuid references auth.users (id),
  purchased_quantity numeric,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  purchased_at       timestamptz
);

alter table public.inventory_requests enable row level security;

-- Everyone signed-in can view requests.
drop policy if exists inventory_requests_read on public.inventory_requests;
create policy inventory_requests_read on public.inventory_requests
  for select using (public.is_active_user());

-- Managers and workers can raise a request (for themselves).
drop policy if exists inventory_requests_insert on public.inventory_requests;
create policy inventory_requests_insert on public.inventory_requests
  for insert with check (public.is_field_user() and requested_by = auth.uid());

-- Owners action requests (approve/reject/purchase); requesters may edit/cancel
-- their own while still pending.
drop policy if exists inventory_requests_update on public.inventory_requests;
create policy inventory_requests_update on public.inventory_requests
  for update using (public.is_owner() or requested_by = auth.uid());

drop policy if exists inventory_requests_delete on public.inventory_requests;
create policy inventory_requests_delete on public.inventory_requests
  for delete using (public.is_owner());

-- Reporting helper.
create or replace view public.v_open_requests as
  select status, count(*) as n from public.inventory_requests
  where status in ('requested', 'approved') group by status;

-- =============================================================================
-- DONE.
-- =============================================================================
