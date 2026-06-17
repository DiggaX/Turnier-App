-- Plan 6: Live-Board — expose participant DISPLAY NAMES publicly for the
-- login-free board, without leaking PII (birthdate, user_id, gamertag).
--
-- The board renders matches with each side's display name via the PostgREST
-- embed `a:participant_a_id(display_name)`. It runs as the truly-anonymous
-- `anon` role (no session). The existing `participants_select_owner_or_staff`
-- policy only lets the owner or staff read participant rows, so the anon board
-- saw empty "TBD" sides. RLS is row-level, so we combine two mechanisms to
-- expose ONLY the safe columns to `anon`:
--
--   1. A permissive SELECT policy scoped to the `anon` role makes participant
--      rows readable to the public board, and
--   2. column-level GRANTs restrict `anon` to the three safe columns
--      (id, tournament_id, display_name). Supabase grants `anon` a broad
--      table-wide SELECT by default, so we REVOKE that first; selecting any
--      other column (e.g. birthdate) as `anon` then errors with "permission
--      denied for column", keeping minors' data private.
--
-- IMPORTANT: the policy is scoped `to anon` only. Registrants sign in via
-- Anonymous Auth and act as role `authenticated` (the `/me`, `/register`,
-- `/checkin-station` pages all require a session) — they keep the stricter
-- owner-or-staff policy and full default column grant, so one registrant still
-- cannot read another's birthdate. Only the session-less public board uses the
-- `anon` path added here.

-- (1) Public (anon-only) read of participant rows. Combined with the column
-- grants below, anon can read only the safe columns.
create policy "participants_select_public_board" on participants
  for select to anon using (true);

-- (2) Restrict the columns the `anon` role may read to the safe set. Revoke the
-- default table-wide SELECT first, then grant exactly the board's columns.
revoke select on participants from anon;
grant select (id, tournament_id, display_name) on participants to anon;
