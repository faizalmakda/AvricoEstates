-- =============================================================================
-- Avrico Estates — SCHEMA v12: audit trail for stock & harvest changes
-- Logs every insert/update/delete on inventory, stock movements, harvests and
-- produce storage — with who, when, and old -> new values. Owners only can read.
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

create table if not exists public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,           -- INSERT / UPDATE / DELETE
  changed_by  uuid,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_owner());   -- only owners can read the log

grant select on public.audit_log to authenticated;

-- The log is written only by this trigger (security definer); clients cannot
-- insert/update/delete it, so it can't be tampered with from the app.
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_table_name,
    (to_jsonb(case when tg_op = 'DELETE' then old else new end) ->> 'id'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end
  );
  return null; -- AFTER trigger
end $$;

do $$
declare t text;
begin
  foreach t in array array['inventory', 'stock_movements', 'yield_records',
                           'produce_batches', 'produce_movements'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- =============================================================================
-- DONE.
-- =============================================================================
