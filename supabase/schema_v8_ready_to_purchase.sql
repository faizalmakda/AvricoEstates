-- =============================================================================
-- Avrico Estates — SCHEMA v8: notify owners when a request is approved & ready
-- to purchase (in addition to telling the requester it was approved/rejected).
-- Run ONCE in the Supabase SQL Editor (after schema_v7_email_design.sql).
-- Replaces one function; your Resend key/config are untouched.
-- =============================================================================

create or replace function private.notify_request_decided()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _email text; _emails jsonb; _reqname text; _body text; _heading text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.status not in ('approved', 'rejected') then return NEW; end if;

  -- 1) Tell the requester their request was approved / rejected ----------------
  select email into _email from auth.users where id = NEW.requested_by;
  if _email is not null then
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
  end if;

  -- 2) On approval, tell the OWNERS it is ready to purchase --------------------
  --    (excluding whoever just approved it, so they don't email themselves).
  if NEW.status = 'approved' then
    select coalesce(jsonb_agg(u.email), '[]'::jsonb) into _emails
      from auth.users u join public.profiles p on p.id = u.id
      where p.role = 'owner' and p.active = true and u.email is not null
        and u.id is distinct from NEW.approved_by;

    if _emails <> '[]'::jsonb then
      select full_name into _reqname from public.profiles where id = NEW.requested_by;
      _body :=
        '<p>A request has been approved and is <strong>ready to purchase</strong>:</p>'
     || '<p style="font-size:16px;font-weight:600;color:#24432f;margin:6px 0;">'
          || coalesce(NEW.quantity::text, '') || ' ' || coalesce(NEW.unit, '') || ' ' || coalesce(NEW.item_name, '') || '</p>'
     || '<p style="color:#555;"><strong>Requested by:</strong> ' || coalesce(_reqname, 'someone') || '</p>'
     || case when NEW.estimated_cost is not null then '<p style="color:#555;"><strong>Estimated cost:</strong> MWK ' || NEW.estimated_cost || '</p>' else '' end;
      begin
        perform private.send_email(
          _emails,
          'Ready to purchase: ' || coalesce(NEW.item_name, 'item'),
          private.email_template('Ready to purchase', _body, private.app_url() || '/#/requests', 'Go to purchases')
        );
      exception when others then null; end;
    end if;
  end if;

  return NEW;
end $$;

-- =============================================================================
-- DONE.
-- =============================================================================
