-- =============================================================================
-- Avrico Estates — SCHEMA v17: don't email the requester to approve their own
-- request. When an owner raises an inventory request, they no longer receive the
-- "needs your approval" email — only the other owners do.
-- Run ONCE in the Supabase SQL Editor (after schema_v7_email_design.sql).
-- Only replaces one function — your Resend key/config stay as they are.
-- =============================================================================

-- New request raised -> email the OTHER owners (never the person who raised it).
create or replace function private.notify_request_created()
returns trigger language plpgsql security definer
set search_path = private, public, auth as $$
declare _emails jsonb; _reqname text; _body text;
begin
  select coalesce(jsonb_agg(u.email), '[]'::jsonb) into _emails
    from auth.users u join public.profiles p on p.id = u.id
    where p.role = 'owner' and p.active = true and u.email is not null
      and u.id <> NEW.requested_by;

  -- Nobody left to notify (e.g. the only owner raised it) -> skip quietly.
  if _emails is null or jsonb_array_length(_emails) = 0 then return NEW; end if;

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

-- =============================================================================
-- DONE. (No need to re-add your Resend key — it is unchanged.)
-- =============================================================================
