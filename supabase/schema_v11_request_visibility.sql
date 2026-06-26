-- =============================================================================
-- Avrico Estates — SCHEMA v11: restrict who can SEE inventory requests
-- Managers & workers can now only see requests THEY raised (and never other
-- people's cost estimates). Owners still see everything.
-- Run ONCE in the Supabase SQL Editor. Takes effect immediately (no redeploy).
-- =============================================================================

drop policy if exists inventory_requests_read on public.inventory_requests;
create policy inventory_requests_read on public.inventory_requests
  for select using (
    public.is_owner() or requested_by = auth.uid()
  );

-- =============================================================================
-- DONE.
-- =============================================================================
