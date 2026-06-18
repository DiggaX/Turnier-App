-- SECURITY HOTFIX — participant PII / qr_token read leak.
--
-- `participants_select_public_board` used `using (true)` for ALL roles. Combined
-- with the `authenticated` role's FULL column SELECT grant, any logged-in user —
-- including any anonymously-registered player — could read every participant's
-- birthdate (minors' PII) and qr_token (the check-in credential, enabling
-- check-in impersonation) of every tournament:
--     select display_name, birthdate, qr_token from participants;  -- returned ALL
--
-- Fix: restrict the blanket board read to the `anon` role only. `anon` is
-- column-granted just (id, tournament_id, display_name), so the public board /
-- home / detail still render names + counts, but no sensitive column is exposed.
-- Authenticated users now read participants only via the owner-or-staff policy
-- (their own row, or staff). Public pages use a sessionless anon client
-- (createPublicClient) so display names + counts keep working for logged-in
-- visitors too.
drop policy if exists "participants_select_public_board" on participants;
create policy "participants_select_public_board" on participants
  for select to anon using (true);

-- Bonus fix: there was no DELETE policy on participants, so the organizer
-- "remove participant" action silently affected 0 rows. Allow staff to delete.
drop policy if exists "participants_delete_staff" on participants;
create policy "participants_delete_staff" on participants
  for delete using (public.is_staff());
