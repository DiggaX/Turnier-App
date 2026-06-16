-- SECURITY FIX (Plan 2 final review, finding C1)
-- Plan 2 enables Supabase Anonymous Auth: signInAnonymously() mints a token with
-- role 'authenticated' for ANY visitor. The Foundation's write policies on games /
-- tournaments were `for all to authenticated using (true) with check (true)`, which
-- would let any anonymous registrant INSERT/UPDATE/DELETE tournaments and games.
-- Tighten those writes to staff only. Public SELECT stays open (registration must
-- read open tournaments + the games catalog).

drop policy if exists "games_write_authenticated" on games;
create policy "games_write_staff" on games
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "tournaments_write_authenticated" on tournaments;
create policy "tournaments_write_staff" on tournaments
  for all using (public.is_staff()) with check (public.is_staff());
