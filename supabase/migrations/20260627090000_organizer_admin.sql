-- Modul 1: Organizer-Admin.
-- (a) Per-tournament team size (1 = 1v1, 5 = 5v5). The chosen game only seeds the
--     default in the create form; the tournament value is authoritative.
alter table tournaments add column if not exists team_size int not null default 1
  check (team_size >= 1);

-- (b) Security hardening (idempotent): ensure tournaments/games writes are
--     staff-only. NOTE: 20260617120000_tighten_write_policies.sql already did this;
--     this block is a defensive no-op when that ran first. `create policy` is NOT
--     idempotent, so drop the staff policy too before (re)creating it.
drop policy if exists "tournaments_write_authenticated" on tournaments;
drop policy if exists "games_write_authenticated" on games;
drop policy if exists "tournaments_write_staff" on tournaments;
drop policy if exists "games_write_staff" on games;

create policy "tournaments_write_staff" on tournaments
  for all using (public.is_staff()) with check (public.is_staff());
create policy "games_write_staff" on games
  for all using (public.is_staff()) with check (public.is_staff());
