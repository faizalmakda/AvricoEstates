-- =============================================================================
-- Avrico Estates — SCHEMA v15: remember a tree's "base note" (the note set at
-- registration / by a manual edit) so deleting all inspections can revert to it.
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

alter table public.trees add column if not exists base_note text;

-- Seed existing trees: their current note becomes the base note fallback.
update public.trees set base_note = notes where base_note is null;

-- =============================================================================
-- DONE.
-- =============================================================================
