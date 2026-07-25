-- =============================================================================
-- Avrico Estates — SECURITY CHECK (read-only, safe to run any time)
-- Paste into the Supabase SQL Editor and run. It changes NOTHING; it only
-- reports. Your app is only safe if every table below shows rls_enabled = true.
-- =============================================================================

-- 1) Every table in your app schema, and whether Row Level Security is ON.
--    Anything showing rls_enabled = false is READABLE/WRITABLE by anyone with
--    the public key — fix it with:  alter table public.<name> enable row level security;
select
  c.relname                         as table_name,
  c.relrowsecurity                  as rls_enabled,
  count(p.polname)                  as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'               -- ordinary tables only
group by c.relname, c.relrowsecurity
order by rls_enabled asc, c.relname;   -- unprotected tables float to the top

-- 2) Tables that have RLS ON but NO policies at all. With RLS on and no
--    policy, the table is fully locked (good for safety) — but if you expect
--    the app to read it, it will silently return nothing. Review these.
select c.relname as table_name_rls_on_but_no_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by c.relname;

-- 3) Storage buckets and whether they are PUBLIC. Photo/evidence buckets that
--    hold farm records should normally be private (public = anyone with the
--    URL can view the file, no login required).
select id as bucket, public as is_public
from storage.buckets
order by public desc, id;
