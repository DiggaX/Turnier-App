-- Modul 1: Organizer-Admin.
-- (a) Per-tournament team size (1 = 1v1, 5 = 5v5). The chosen game only seeds the
--     default in the create form; the tournament value is authoritative.
alter table tournaments add column if not exists team_size int not null default 1
  check (team_size >= 1);

-- (b) Security hardening: the original policies allowed ANY authenticated user
--     (incl. anonymous players) to write tournaments/games. Replace with staff-only,
--     matching matches/participants. Public SELECT stays.
drop policy if exists "tournaments_write_authenticated" on tournaments;
drop policy if exists "games_write_authenticated" on games;

create policy "tournaments_write_staff" on tournaments
  for all using (public.is_staff()) with check (public.is_staff());
create policy "games_write_staff" on games
  for all using (public.is_staff()) with check (public.is_staff());
