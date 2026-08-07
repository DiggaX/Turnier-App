-- Archiving for tournaments.
--
-- A finished tournament stayed in the organizer list forever: it could not be
-- deleted (results and participant history are worth keeping) and there was no
-- way to put it away. Archiving hides it from the organizer list and the public
-- org page while leaving every row intact, and it is reversible.
--
-- Deep links keep working on purpose: /t/<id> and its board stay reachable so
-- shared links and printed QR codes do not rot.

alter table public.tournaments
  add column if not exists archived_at timestamptz;

comment on column public.tournaments.archived_at is
  'When set, the tournament is hidden from the organizer list and the public org page. Deep links still resolve. Reversible.';

-- Both list queries filter on "archived_at is null" scoped to an org, so index
-- the active rows only — archived ones are the minority we never scan by org.
create index if not exists tournaments_org_active_idx
  on public.tournaments (org_id)
  where archived_at is null;

-- No RLS change needed: tournaments_write_staff_same_org already covers UPDATE
-- for staff in the owning org, which is exactly who may archive.
