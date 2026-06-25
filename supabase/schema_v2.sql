-- =============================================================================
-- Avrico Estates — Orchard Management System  ·  SCHEMA v2
-- =============================================================================
-- Run this ONCE in Supabase (SQL Editor) AFTER schema.sql.
-- It is additive and safe to re-run (uses "if not exists" / "drop ... if exists").
--
-- Adds: zones, rows, richer trees, inspections, treatments, tree photos,
-- replacements, inventory + stock movements, storage, produce batches/movements,
-- yield records, task links, 4 user roles, and reporting views.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. ROLES  (owner / manager / worker / viewer) + helper functions
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists job_title  text;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'manager', 'worker', 'viewer'));

create or replace function public.my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

-- owner or manager = "staff" (can write most things)
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select public.my_role() in ('owner', 'manager')
$$;

-- owner/manager/worker = can record field activity (inspections, usage, evidence)
create or replace function public.is_field_user()
returns boolean language sql security definer stable set search_path = public as $$
  select public.my_role() in ('owner', 'manager', 'worker')
$$;

-- ---------------------------------------------------------------------------
-- 1. ZONES & ROWS
-- ---------------------------------------------------------------------------
create table if not exists public.zones (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,           -- A1, A2, A3, B1, B2
  name                text,
  description         text,
  area_ha             numeric,
  planned_tree_count  integer default 0,
  created_at          timestamptz not null default now()
);

create table if not exists public.rows (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references public.zones (id) on delete cascade,
  row_number  integer not null check (row_number >= 1),
  label       text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (zone_id, row_number)
);

-- Seed the five blocks with their planned tree counts.
insert into public.zones (code, name, planned_tree_count) values
  ('A1', 'Zone A1', 1154),
  ('A2', 'Zone A2', 175),
  ('A3', 'Zone A3', 385),
  ('B1', 'Zone B1', 524),
  ('B2', 'Zone B2', 634)
on conflict (code) do update set planned_tree_count = excluded.planned_tree_count;

-- ---------------------------------------------------------------------------
-- 2. TREES  (extend the existing table for structured identification)
-- ---------------------------------------------------------------------------
alter table public.trees add column if not exists zone_id            uuid references public.zones (id);
alter table public.trees add column if not exists row_number         integer;
alter table public.trees add column if not exists tree_number        integer;
alter table public.trees add column if not exists deleted_at         timestamptz;
alter table public.trees add column if not exists last_inspection_on date;

-- `code` already exists (NOT NULL) and is reused as the human tree_code, e.g. B2-R01-T003.
-- Duplicate prevention: one tree per physical position, and a unique code.
create unique index if not exists trees_position_unique
  on public.trees (zone_id, row_number, tree_number)
  where zone_id is not null and row_number is not null and tree_number is not null;
create unique index if not exists trees_code_unique on public.trees (code);

-- ---------------------------------------------------------------------------
-- 3. TREE LIFE-HISTORY  (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.tree_inspections (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references public.trees (id) on delete cascade,
  inspection_date date not null default current_date,
  status          text,                 -- status found at inspection
  findings        text,
  photo_path      text,
  inspector_id    uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

create table if not exists public.tree_treatments (
  id                uuid primary key default gen_random_uuid(),
  tree_id           uuid not null references public.trees (id) on delete cascade,
  treatment_date    date not null default current_date,
  product           text,
  inventory_item_id uuid,               -- optional link to stock used
  quantity          numeric,
  unit              text,
  reason            text,
  notes             text,
  applied_by        uuid references auth.users (id),
  created_at        timestamptz not null default now()
);

create table if not exists public.tree_photos (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references public.trees (id) on delete cascade,
  photo_path  text not null,
  caption     text,
  taken_on    date default current_date,
  uploaded_by uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.tree_replacements (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references public.trees (id) on delete cascade,
  replaced_on   date not null default current_date,
  previous_status text,
  reason        text,
  notes         text,
  performed_by  uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. INVENTORY & WAREHOUSE
-- ---------------------------------------------------------------------------
-- Reuse existing `inventory` table; add warehouse fields.
alter table public.inventory add column if not exists sku        text;
alter table public.inventory add column if not exists min_stock  numeric default 0;
alter table public.inventory add column if not exists location   text;

create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.inventory (id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out', 'transfer', 'adjust')),
  quantity      numeric not null check (quantity >= 0),
  unit          text,
  zone_id       uuid references public.zones (id),     -- where it was used
  reason        text,
  from_location text,
  to_location   text,
  task_id       uuid,                                  -- optional link to a task
  performed_by  uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. PRODUCE STORAGE & YIELD
-- ---------------------------------------------------------------------------
create table if not exists public.storage_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text,                 -- shed, cold room, etc.
  capacity    numeric,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Harvest by block (not per tree).
create table if not exists public.yield_records (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid references public.zones (id),
  produce_type  text not null default 'Avocado',
  quantity      numeric not null check (quantity >= 0),
  unit          text default 'kg',
  grade         text,
  harvest_date  date not null default current_date,
  storage_location_id uuid references public.storage_locations (id),
  notes         text,
  recorded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- Produce currently held in storage.
create table if not exists public.produce_batches (
  id            uuid primary key default gen_random_uuid(),
  produce_type  text not null,
  zone_id       uuid references public.zones (id),
  yield_id      uuid references public.yield_records (id),
  grade         text,
  quantity      numeric not null default 0 check (quantity >= 0),
  unit          text default 'kg',
  storage_location_id uuid references public.storage_locations (id),
  status        text not null default 'in_storage'
                  check (status in ('in_storage', 'sold', 'moved', 'used')),
  created_at    timestamptz not null default now()
);

create table if not exists public.produce_movements (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.produce_batches (id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out')),
  quantity      numeric not null check (quantity >= 0),
  reason        text,                 -- sold / moved / used / spoilage
  destination   text,
  performed_by  uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. TASKS  (links + expanded statuses)
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists zone_id            uuid references public.zones (id);
alter table public.tasks add column if not exists row_number         integer;
alter table public.tasks add column if not exists tree_id            uuid references public.trees (id);
alter table public.tasks add column if not exists inventory_item_id  uuid references public.inventory (id);
alter table public.tasks add column if not exists produce_batch_id   uuid references public.produce_batches (id);

-- Expand statuses: Pending / In Progress / Completed / Overdue / Cancelled.
-- Drop the old constraint FIRST, then migrate 'Open' -> 'Pending', then re-add.
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks set status = 'Pending' where status = 'Open';
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'));
alter table public.tasks alter column status set default 'Pending';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.zones             enable row level security;
alter table public.rows              enable row level security;
alter table public.tree_inspections  enable row level security;
alter table public.tree_treatments   enable row level security;
alter table public.tree_photos       enable row level security;
alter table public.tree_replacements enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.storage_locations enable row level security;
alter table public.yield_records     enable row level security;
alter table public.produce_batches   enable row level security;
alter table public.produce_movements enable row level security;

-- Everyone signed-in (incl. viewer) can read; helper for brevity below.
-- READ policies -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'zones','rows','tree_inspections','tree_treatments','tree_photos',
    'tree_replacements','stock_movements','storage_locations','yield_records',
    'produce_batches','produce_movements'
  ] loop
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_active_user());', t, t);
  end loop;
end $$;

-- WRITE policies (owner/manager) for structural/management tables -----------
do $$
declare t text;
begin
  foreach t in array array[
    'zones','rows','storage_locations','yield_records','produce_batches','produce_movements'
  ] loop
    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t, t);
  end loop;
end $$;

-- Field activity (owner/manager/worker) can INSERT; staff can edit/delete ----
do $$
declare t text;
begin
  foreach t in array array['tree_inspections','tree_treatments','tree_photos','stock_movements'] loop
    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_field_user());', t, t);
    execute format('drop policy if exists %I_modify on public.%I;', t, t);
    execute format(
      'create policy %I_modify on public.%I for update using (public.is_staff());', t, t);
    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_staff());', t, t);
  end loop;
end $$;

-- tree_replacements: staff only (a replacement is a management action)
drop policy if exists tree_replacements_write on public.tree_replacements;
create policy tree_replacements_write on public.tree_replacements
  for all using (public.is_staff()) with check (public.is_staff());

-- Tighten existing TREES policies for the 4-role model.
drop policy if exists trees_insert on public.trees;
create policy trees_insert on public.trees for insert with check (public.is_staff());
drop policy if exists trees_update on public.trees;
create policy trees_update on public.trees for update using (public.is_staff());
-- delete stays owner-only (from schema.sql: trees_delete uses is_owner()).

-- Inventory writable by staff (definitions); movements handled above.
drop policy if exists inventory_cud on public.inventory;
create policy inventory_cud on public.inventory
  for all using (public.is_staff()) with check (public.is_staff());

-- =============================================================================
-- REPORTING VIEWS  (read-only convenience for dashboard & reports)
-- =============================================================================
create or replace view public.v_trees_per_zone as
  select z.code as zone, z.planned_tree_count,
         count(t.id) filter (where t.archived = false and t.deleted_at is null) as registered_trees
  from public.zones z
  left join public.trees t on t.zone_id = z.id
  group by z.code, z.planned_tree_count
  order by z.code;

create or replace view public.v_tree_status_by_zone as
  select z.code as zone, t.status, count(*) as trees
  from public.trees t join public.zones z on z.id = t.zone_id
  where t.archived = false and t.deleted_at is null
  group by z.code, t.status
  order by z.code, t.status;

-- Current stock = the item's baseline quantity, adjusted by signed movements.
-- (Items created via the Inventory page set `quantity` directly; movements are
-- deltas applied on top. A 'transfer' only changes location, not the total.)
create or replace view public.v_inventory_levels as
  select i.id, i.name, i.category, i.unit, i.min_stock, i.location,
         i.quantity
         + coalesce(sum(case m.movement_type
                          when 'in'     then m.quantity
                          when 'out'    then -m.quantity
                          when 'adjust' then m.quantity
                          else 0 end), 0) as current_stock
  from public.inventory i
  left join public.stock_movements m on m.item_id = i.id
  group by i.id, i.name, i.category, i.unit, i.min_stock, i.location, i.quantity;

create or replace view public.v_low_stock as
  select * from public.v_inventory_levels
  where min_stock is not null and current_stock <= min_stock;

create or replace view public.v_yield_by_zone as
  select z.code as zone, y.produce_type,
         sum(y.quantity) as total_quantity, y.unit
  from public.yield_records y left join public.zones z on z.id = y.zone_id
  group by z.code, y.produce_type, y.unit
  order by z.code;

create or replace view public.v_produce_in_storage as
  select produce_type, unit, sum(quantity) as quantity_in_storage
  from public.produce_batches
  where status = 'in_storage'
  group by produce_type, unit;

create or replace view public.v_task_status_counts as
  select status, count(*) as tasks from public.tasks group by status;

-- =============================================================================
-- DONE.  Next: the app's Tree Register, Zones and reports read from these.
-- =============================================================================
