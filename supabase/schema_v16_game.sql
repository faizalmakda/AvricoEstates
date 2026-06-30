-- =============================================================================
-- Avrico Estates — SCHEMA v16: shared leaderboard for the (optional) game.
-- Fully self-contained: nothing else references this table, so it can be
-- dropped any time with `drop table public.game_scores;`.
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

create table if not exists public.game_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id),
  player_name text,
  score       integer not null,
  created_at  timestamptz not null default now()
);

alter table public.game_scores enable row level security;

drop policy if exists game_scores_read on public.game_scores;
create policy game_scores_read on public.game_scores
  for select using (public.is_active_user());

drop policy if exists game_scores_insert on public.game_scores;
create policy game_scores_insert on public.game_scores
  for insert with check (user_id = auth.uid());

grant select, insert on public.game_scores to authenticated;

-- =============================================================================
-- DONE.
-- =============================================================================
