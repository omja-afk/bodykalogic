-- BodyKaLogic — run this once in the Supabase SQL editor.
--
-- One row per user holding the whole tracker state as JSON. The app is small
-- enough that a document beats a dozen relational tables: there is one writer
-- per row, no cross-user queries, and no reporting to do on the server side.
--
-- Row-level security is the important half. The anon key shipped in the browser
-- is public, so these policies are the only thing standing between one account's
-- data and another's. Every policy below is scoped to auth.uid().

create table if not exists public.tracker_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker_state enable row level security;

-- Dropped first so the script can be re-run without erroring.
drop policy if exists "read own row"   on public.tracker_state;
drop policy if exists "insert own row" on public.tracker_state;
drop policy if exists "update own row" on public.tracker_state;
drop policy if exists "delete own row" on public.tracker_state;

create policy "read own row" on public.tracker_state
  for select using (auth.uid() = user_id);

create policy "insert own row" on public.tracker_state
  for insert with check (auth.uid() = user_id);

create policy "update own row" on public.tracker_state
  for update using (auth.uid() = user_id)
           with check (auth.uid() = user_id);

create policy "delete own row" on public.tracker_state
  for delete using (auth.uid() = user_id);

-- Keep updated_at honest: the client sends it, but the server has the last word,
-- which is what makes "whose copy is newer" answerable across devices with
-- unsynchronised clocks.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tracker_state_touch on public.tracker_state;
create trigger tracker_state_touch
  before insert or update on public.tracker_state
  for each row execute function public.touch_updated_at();

-- Meal analysis usage: one row per analysis, used to cap each account at a
-- daily number. Users can add rows and read their own, but never change or
-- delete them, so a limit cannot be reset from the browser.
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

drop policy if exists "read own usage"   on public.ai_usage;
drop policy if exists "insert own usage" on public.ai_usage;

create policy "read own usage" on public.ai_usage
  for select using (auth.uid() = user_id);

create policy "insert own usage" on public.ai_usage
  for insert with check (auth.uid() = user_id);
