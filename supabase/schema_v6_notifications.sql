-- =============================================================================
-- Avrico Estates — SCHEMA v6: Email notifications (via Resend)
-- Sends emails on: task assigned, request raised (to owners), request decided.
-- 100% SQL — no Edge Function. Run ONCE in the Supabase SQL Editor.
--
-- AFTER running this, add your Resend key + from-address with the small INSERT
-- shown at the very bottom (and in the chat notes).
-- =============================================================================

-- 1) HTTP-from-Postgres extension (lets the database call Resend's API) --------
create extension if not exists pg_net;

-- 2) Private config (NOT exposed to the app/API) ------------------------------
create schema if not exists private;

create table if not exists private.app_config (
  key   text primary key,
  value text
);

create or replace function private.cfg(_key text)
returns text language sql stable security definer set search_path = private as $$
  select value from private.app_config where key = _key
$$;

-- 3) One central "send an email" function -------------------------------------
-- Change provider later by editing ONLY this function + the config values.
create or replace function private.send_email(_to jsonb, _subject text, _html text)
returns void language plpgsql security definer
set search_path = private, public, net as $$
declare
  _key  text := private.cfg('resend_api_key');
  _from text := coalesce(private.cfg('email_from'), 'Avrico Estates <onboarding@resend.dev>');
begin
  if _key is null or _to is null or _to = '[]'::jsonb then
    return;  -- not configured yet, or no recipients — do nothing
  end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || _key,
                                  'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', _from, 'to', _to,
                                  'subject', _subject, 'html', _html)
  );
end $$;

-- helper: the app link used in emails
create or replace function private.app_url()
returns text language sql stable security definer set search_path = private as $$
  select coalesce(private.cfg('app_url'), 'https://app.avricoestates.com')
$$;

-- =============================================================================
-- 4) TRIGGERS
-- Each is wrapped so a notification failure can NEVER block the actual action.
-- =============================================================================

-- (a) Task assigned / re-assigned -> email the assignee -----------------------
create or replace function private.notify_task_assigned()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _email text;
begin
  if NEW.assigned_to is null then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.assigned_to is not distinct from OLD.assigned_to then return NEW; end if;

  select email into _email from auth.users where id = NEW.assigned_to;
  if _email is null then return NEW; end if;

  begin
    perform private.send_email(
      to_jsonb(array[_email]),
      'New task assigned: ' || coalesce(NEW.title, 'Task'),
      '<p>You have been assigned a task on <strong>Avrico Estates</strong>:</p>' ||
      '<p style="font-size:16px"><strong>' || coalesce(NEW.title, 'Task') || '</strong></p>' ||
      coalesce('<p>' || NEW.instructions || '</p>', '') ||
      case when NEW.due_date is not null then '<p>Due: ' || NEW.due_date || '</p>' else '' end ||
      '<p><a href="' || private.app_url() || '">Open the app &rarr;</a></p>'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assigned_to on public.tasks
  for each row execute function private.notify_task_assigned();

-- (b) New request raised -> email the owners ----------------------------------
create or replace function private.notify_request_created()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _emails jsonb;
begin
  select coalesce(jsonb_agg(u.email), '[]'::jsonb) into _emails
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.role = 'owner' and p.active = true and u.email is not null;

  begin
    perform private.send_email(
      _emails,
      'New inventory request: ' || coalesce(NEW.item_name, 'item'),
      '<p>A new inventory request needs your approval:</p>' ||
      '<p style="font-size:16px"><strong>' || coalesce(NEW.quantity::text, '') || ' ' ||
        coalesce(NEW.unit, '') || ' ' || coalesce(NEW.item_name, '') || '</strong></p>' ||
      case when NEW.estimated_cost is not null
           then '<p>Estimated cost: MWK ' || NEW.estimated_cost || '</p>' else '' end ||
      coalesce('<p>Reason: ' || NEW.reason || '</p>', '') ||
      '<p><a href="' || private.app_url() || '">Review in the app &rarr;</a></p>'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_notify_request_created on public.inventory_requests;
create trigger trg_notify_request_created
  after insert on public.inventory_requests
  for each row execute function private.notify_request_created();

-- (c) Request approved/rejected -> email the requester ------------------------
create or replace function private.notify_request_decided()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _email text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.status not in ('approved', 'rejected') then return NEW; end if;

  select email into _email from auth.users where id = NEW.requested_by;
  if _email is null then return NEW; end if;

  begin
    perform private.send_email(
      to_jsonb(array[_email]),
      'Your request was ' || NEW.status || ': ' || coalesce(NEW.item_name, 'item'),
      '<p>Your inventory request has been <strong>' || NEW.status || '</strong>:</p>' ||
      '<p>' || coalesce(NEW.quantity::text, '') || ' ' || coalesce(NEW.unit, '') || ' ' ||
        coalesce(NEW.item_name, '') || '</p>' ||
      case when NEW.status = 'rejected' and NEW.notes is not null
           then '<p>Reason: ' || NEW.notes || '</p>' else '' end ||
      '<p><a href="' || private.app_url() || '">Open the app &rarr;</a></p>'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_notify_request_decided on public.inventory_requests;
create trigger trg_notify_request_decided
  after update of status on public.inventory_requests
  for each row execute function private.notify_request_decided();

-- =============================================================================
-- 5) ADD YOUR KEYS  (run this separately once you have your Resend API key)
--    Replace the values, then run it. Re-run anytime to change them.
--
-- insert into private.app_config (key, value) values
--   ('resend_api_key', 're_YOUR_KEY_HERE'),
--   ('email_from',     'Avrico Estates <onboarding@resend.dev>'),  -- switch to your domain once verified
--   ('app_url',        'https://app.avricoestates.com')
-- on conflict (key) do update set value = excluded.value;
-- =============================================================================
