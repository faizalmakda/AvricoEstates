-- =============================================================================
-- Avrico Estates — database schema & security rules
-- =============================================================================
-- Run this ONCE in your Supabase project:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run
--
-- This file is safe to re-run; it uses "if not exists" / "drop policy if exists".
--
-- WHAT THIS DOES
--   * Creates the tables (trees, tasks, inventory, produce, logs, profiles).
--   * Turns on Row Level Security (RLS) so the database itself enforces who can
--     do what — owners get full access; the farm manager is limited to viewing
--     his tasks, marking them complete with photo evidence, and ADDING tree
--     status logs (he can never edit or delete existing records).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES  (one row per login; holds the person's role)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default 'New user',
  role        text not null default 'manager' check (role in ('owner', 'manager')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helper: is the current logged-in user an active OWNER?
-- SECURITY DEFINER lets it read profiles without tripping RLS recursion.
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and active = true
  );
$$;

-- Helper: is the current user an active member at all (owner or manager)?
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

-- When a new auth user is created, automatically give them a profile.
-- Default role is 'manager' (limited). An owner can promote them later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'manager')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. TREES  (owner-managed master records)
-- ---------------------------------------------------------------------------
create table if not exists public.trees (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                 -- e.g. "A-014"
  species     text,
  location    text,
  planted_on  date,
  status      text not null default 'Healthy',
  notes       text,
  archived    boolean not null default false,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3. TREE LOGS  (append-only history: status updates, notes, photos)
create table if not exists public.tree_logs (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references public.trees (id) on delete cascade,
  status      text,            -- Healthy / Dead / Diseased / Weak / Missing / Replaced / Needs Inspection
  note        text,
  photo_path  text,            -- path in the 'evidence' storage bucket
  logged_by   uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. TASKS  (owner-created and owner-edited only)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  instructions  text,
  assigned_to   uuid references auth.users (id),
  priority      text not null default 'Normal' check (priority in ('Low', 'Normal', 'High')),
  due_date      date,
  status        text not null default 'Open' check (status in ('Open', 'In Progress', 'Completed')),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 5. TASK SUBMISSIONS  (append-only: how the manager marks work done + evidence)
create table if not exists public.task_submissions (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  status        text not null default 'Completed',
  note          text,
  photo_path    text,
  submitted_by  uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- When a submission is added, reflect its status on the parent task so owners
-- see progress at a glance. (The task ROW is never edited by the manager
-- directly — this trigger runs with definer rights on his behalf.)
create or replace function public.sync_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks
     set status = new.status,
         updated_at = now()
   where id = new.task_id;
  return new;
end;
$$;

drop trigger if exists on_task_submission on public.task_submissions;
create trigger on_task_submission
  after insert on public.task_submissions
  for each row execute function public.sync_task_status();

-- ---------------------------------------------------------------------------
-- 6. INVENTORY  (owner-managed)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,
  quantity    numeric not null default 0,
  unit        text,
  notes       text,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 7. PRODUCE / YIELD  (owner-managed)
create table if not exists public.produce (
  id           uuid primary key default gen_random_uuid(),
  tree_id      uuid references public.trees (id) on delete set null,
  crop         text not null,
  quantity     numeric not null default 0,
  unit         text default 'kg',
  harvested_on date not null default current_date,
  notes        text,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles         enable row level security;
alter table public.trees            enable row level security;
alter table public.tree_logs        enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_submissions enable row level security;
alter table public.inventory        enable row level security;
alter table public.produce          enable row level security;

-- ---- PROFILES -------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);          -- any logged-in user can read names/roles

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (public.is_owner());          -- only owners add users

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (public.is_owner());               -- only owners change roles/permissions

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (public.is_owner());               -- only owners remove users

-- ---- TREES ----------------------------------------------------------------
drop policy if exists trees_select on public.trees;
create policy trees_select on public.trees
  for select using (public.is_active_user());

drop policy if exists trees_insert on public.trees;
create policy trees_insert on public.trees
  for insert with check (public.is_owner());          -- only owners create trees

drop policy if exists trees_update on public.trees;
create policy trees_update on public.trees
  for update using (public.is_owner());               -- only owners edit/archive trees

drop policy if exists trees_delete on public.trees;
create policy trees_delete on public.trees
  for delete using (public.is_owner());               -- manager can NEVER delete trees

-- ---- TREE LOGS (append-only for everyone; manager's main write power) ------
drop policy if exists tree_logs_select on public.tree_logs;
create policy tree_logs_select on public.tree_logs
  for select using (public.is_active_user());

drop policy if exists tree_logs_insert on public.tree_logs;
create policy tree_logs_insert on public.tree_logs
  for insert with check (
    public.is_active_user() and logged_by = auth.uid()
  );                                                  -- owners AND manager can ADD logs

drop policy if exists tree_logs_update on public.tree_logs;
create policy tree_logs_update on public.tree_logs
  for update using (public.is_owner());               -- logs are never edited by manager

drop policy if exists tree_logs_delete on public.tree_logs;
create policy tree_logs_delete on public.tree_logs
  for delete using (public.is_owner());               -- only owners can delete a log

-- ---- TASKS ----------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    public.is_owner() or assigned_to = auth.uid()     -- manager sees only HIS tasks
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.is_owner());          -- only owners create tasks

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (public.is_owner());               -- manager can't edit/amend instructions

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (public.is_owner());               -- manager can NEVER delete a task

-- ---- TASK SUBMISSIONS (append-only; how manager completes work) -----------
drop policy if exists task_submissions_select on public.task_submissions;
create policy task_submissions_select on public.task_submissions
  for select using (
    public.is_owner() or submitted_by = auth.uid()
  );

drop policy if exists task_submissions_insert on public.task_submissions;
create policy task_submissions_insert on public.task_submissions
  for insert with check (
    submitted_by = auth.uid()
    and (
      public.is_owner()
      or exists (                                     -- manager may only submit for HIS task
        select 1 from public.tasks t
        where t.id = task_id and t.assigned_to = auth.uid()
      )
    )
  );

drop policy if exists task_submissions_update on public.task_submissions;
create policy task_submissions_update on public.task_submissions
  for update using (public.is_owner());               -- evidence can't be altered

drop policy if exists task_submissions_delete on public.task_submissions;
create policy task_submissions_delete on public.task_submissions
  for delete using (public.is_owner());               -- manager can't delete evidence

-- ---- INVENTORY ------------------------------------------------------------
drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory
  for select using (public.is_active_user());

drop policy if exists inventory_cud on public.inventory;
create policy inventory_cud on public.inventory
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- PRODUCE / YIELD ------------------------------------------------------
drop policy if exists produce_select on public.produce;
create policy produce_select on public.produce
  for select using (public.is_active_user());

drop policy if exists produce_cud on public.produce;
create policy produce_cud on public.produce
  for all using (public.is_owner()) with check (public.is_owner());

-- =============================================================================
-- STORAGE  (photo evidence + tree-log photos live in a bucket named 'evidence')
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do nothing;

drop policy if exists evidence_read on storage.objects;
create policy evidence_read on storage.objects
  for select using (bucket_id = 'evidence');          -- anyone can view photos (bucket is public)

drop policy if exists evidence_upload on storage.objects;
create policy evidence_upload on storage.objects
  for insert with check (
    bucket_id = 'evidence' and public.is_active_user()
  );                                                  -- any active user can upload

drop policy if exists evidence_delete on storage.objects;
create policy evidence_delete on storage.objects
  for delete using (
    bucket_id = 'evidence' and public.is_owner()
  );                                                  -- only owners delete photos

-- =============================================================================
-- DONE. Next: create your login accounts (see SETUP.md), then mark the
-- 3 directors as owners with:
--   update public.profiles set role = 'owner' where id =
--     (select id from auth.users where email = 'director@example.com');
-- =============================================================================
