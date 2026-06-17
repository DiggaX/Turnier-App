-- Plan 4: Generator & Brackets — matches table (structure only; scores/results are Plan 5)

create type match_status as enum ('pending', 'live', 'done', 'bye');

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  round int not null,                 -- 1 = first round / matchday 1
  slot int not null,                  -- position within the round (0-based)
  participant_a_id uuid references participants (id) on delete set null,
  participant_b_id uuid references participants (id) on delete set null,
  winner_id uuid references participants (id) on delete set null,
  next_match_id uuid references matches (id) on delete set null,  -- single-elim advancement
  next_slot char(1) check (next_slot in ('a','b')),               -- which side the winner feeds
  status match_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index matches_tournament_idx on matches (tournament_id, round, slot);

alter table matches enable row level security;
-- public read (needed for the live-board later); staff write
create policy "matches_select_public" on matches for select using (true);
create policy "matches_write_staff" on matches
  for all using (public.is_staff()) with check (public.is_staff());
