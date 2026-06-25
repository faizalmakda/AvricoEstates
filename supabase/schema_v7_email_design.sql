-- =============================================================================
-- Avrico Estates — SCHEMA v7: nicer branded emails + reliable app link
-- Run ONCE in the Supabase SQL Editor (after schema_v6_notifications.sql).
-- Only replaces functions — your Resend key/config stay as they are.
-- =============================================================================

-- Always return a valid https app link (guards against a misconfigured app_url).
create or replace function private.app_url()
returns text language sql stable security definer set search_path = private as $$
  select case
    when coalesce(private.cfg('app_url'), '') ~ '^https?://' then private.cfg('app_url')
    else 'https://app.avricoestates.com'
  end
$$;

-- Branded HTML wrapper used by every email. Logo is served from the app host
-- (GitHub Pages) — it does not use any Supabase storage or bandwidth.
create or replace function private.email_template(_heading text, _body_html text, _cta_url text, _cta_label text)
returns text language sql immutable set search_path = private as $$
  select
    '<div style="background:#f4f1e9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
 || '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e3d7;">'
 ||   '<div style="background:#24432f;padding:22px 24px;text-align:center;">'
 ||     '<img src="https://app.avricoestates.com/logo-mark.png" width="58" height="58" alt="Avrico Estates" style="border-radius:50%;background:#ffffff;display:block;margin:0 auto 8px;">'
 ||     '<div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px;">Avrico Estates</div>'
 ||   '</div>'
 ||   '<div style="padding:26px 24px;color:#2b2b2b;font-size:15px;line-height:1.55;">'
 ||     '<h1 style="font-size:18px;margin:0 0 14px;color:#24432f;">' || _heading || '</h1>'
 ||     _body_html
 ||     '<div style="margin-top:24px;"><a href="' || _cta_url || '" style="background:#4d7a32;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;display:inline-block;">' || _cta_label || '</a></div>'
 ||   '</div>'
 ||   '<div style="padding:14px 24px;background:#f4f1e9;color:#8a8472;font-size:12px;text-align:center;">Avrico Estates farm management &middot; automated message</div>'
 || '</div></div>'
$$;

-- (a) Task assigned -----------------------------------------------------------
create or replace function private.notify_task_assigned()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _email text; _body text;
begin
  if NEW.assigned_to is null then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.assigned_to is not distinct from OLD.assigned_to then return NEW; end if;

  select email into _email from auth.users where id = NEW.assigned_to;
  if _email is null then return NEW; end if;

  _body :=
    '<p>You have been assigned a task:</p>'
 || '<p style="font-size:16px;font-weight:600;color:#24432f;margin:6px 0;">' || coalesce(NEW.title, 'Task') || '</p>'
 || coalesce('<p style="color:#555;">' || NEW.instructions || '</p>', '')
 || case when NEW.due_date is not null then '<p style="color:#555;"><strong>Due:</strong> ' || NEW.due_date || '</p>' else '' end;

  begin
    perform private.send_email(
      to_jsonb(array[_email]),
      'New task assigned: ' || coalesce(NEW.title, 'Task'),
      private.email_template('New task assigned', _body, private.app_url() || '/#/tasks/' || NEW.id, 'View task')
    );
  exception when others then null; end;
  return NEW;
end $$;

-- (b) New request raised -> owners --------------------------------------------
create or replace function private.notify_request_created()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _emails jsonb; _reqname text; _body text;
begin
  select coalesce(jsonb_agg(u.email), '[]'::jsonb) into _emails
    from auth.users u join public.profiles p on p.id = u.id
    where p.role = 'owner' and p.active = true and u.email is not null;

  select full_name into _reqname from public.profiles where id = NEW.requested_by;

  _body :=
    '<p>A new inventory request needs your approval:</p>'
 || '<p style="font-size:16px;font-weight:600;color:#24432f;margin:6px 0;">'
      || coalesce(NEW.quantity::text, '') || ' ' || coalesce(NEW.unit, '') || ' ' || coalesce(NEW.item_name, '') || '</p>'
 || '<p style="color:#555;"><strong>Requested by:</strong> ' || coalesce(_reqname, 'someone') || '</p>'
 || case when NEW.estimated_cost is not null then '<p style="color:#555;"><strong>Estimated cost:</strong> MWK ' || NEW.estimated_cost || '</p>' else '' end
 || coalesce('<p style="color:#555;"><strong>Reason:</strong> ' || NEW.reason || '</p>', '');

  begin
    perform private.send_email(
      _emails,
      'New inventory request: ' || coalesce(NEW.item_name, 'item'),
      private.email_template('New inventory request', _body, private.app_url() || '/#/requests', 'Review request')
    );
  exception when others then null; end;
  return NEW;
end $$;

-- (c) Request approved/rejected -> requester ----------------------------------
create or replace function private.notify_request_decided()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _email text; _body text; _heading text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.status not in ('approved', 'rejected') then return NEW; end if;

  select email into _email from auth.users where id = NEW.requested_by;
  if _email is null then return NEW; end if;

  _heading := 'Request ' || initcap(NEW.status);
  _body :=
    '<p>Your inventory request has been <strong style="color:' || case when NEW.status='approved' then '#2e7d32' else '#b5392b' end || ';">' || NEW.status || '</strong>:</p>'
 || '<p style="font-size:16px;font-weight:600;color:#24432f;margin:6px 0;">'
      || coalesce(NEW.quantity::text, '') || ' ' || coalesce(NEW.unit, '') || ' ' || coalesce(NEW.item_name, '') || '</p>'
 || case when NEW.status = 'rejected' and NEW.notes is not null then '<p style="color:#555;"><strong>Reason:</strong> ' || NEW.notes || '</p>' else '' end;

  begin
    perform private.send_email(
      to_jsonb(array[_email]),
      'Your request was ' || NEW.status || ': ' || coalesce(NEW.item_name, 'item'),
      private.email_template(_heading, _body, private.app_url() || '/#/requests', 'Open the app')
    );
  exception when others then null; end;
  return NEW;
end $$;

-- =============================================================================
-- DONE. (No need to re-add your Resend key — it is unchanged.)
-- =============================================================================
