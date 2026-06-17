-- Allow staff to delete participants.
-- Without this policy, Supabase RLS silently blocks DELETE (0 rows affected, no
-- error) even though the client action returns { ok: true }, causing a false-success
-- redirect when a staff member removes a participant from the organizer UI.
create policy "participants_delete_staff" on participants
  for delete using (public.is_staff());
