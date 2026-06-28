-- =============================================================================
-- Avrico Estates — SCHEMA v14: simplify tree statuses to Healthy / Needs
-- Attention / Dead. Moves any existing Weak, Diseased, Needs Inspection,
-- Missing, Replaced trees into "Needs Attention".
-- Run ONCE in the Supabase SQL Editor. (trees.status has no DB constraint.)
-- =============================================================================

update public.trees
set status = 'Needs Attention'
where status not in ('Healthy', 'Dead');

-- =============================================================================
-- DONE. (Historical inspection/log entries keep their original wording.)
-- =============================================================================
