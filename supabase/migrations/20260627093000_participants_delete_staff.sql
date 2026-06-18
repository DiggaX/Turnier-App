-- Allow staff to delete participants.
-- Without this policy, Supabase RLS silently blocks DELETE (0 rows affected, no
-- error) even though the client action returns { ok: true }, causing a false-success
-- redirect when a staff member removes a participant from the organizer UI.
--
-- NOTE: the later security hotfix 20260628090000_fix_participant_read_leak
-- re-creates this policy idempotently (drop-if-exists + create) alongside the
-- board read-leak fix, so on a fresh rebuild this runs first and is re-affirmed.
-- Original timestamp was 20260628090000 (collided with that hotfix); renamed to
-- 20260627093000 so every migration has a unique version.
create policy "participants_delete_staff" on participants
  for delete using (public.is_staff());
