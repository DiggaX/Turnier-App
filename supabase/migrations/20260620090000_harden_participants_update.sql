-- SECURITY HARDENING (Plan 4 review, pre-existing Plan 2 surface)
-- The UPDATE policy `participants_update_owner_or_staff` (added in
-- 20260617090000_registration_consent.sql) had a USING clause but NO WITH CHECK.
-- Without WITH CHECK, a registrant could UPDATE their own row via a direct
-- PostgREST call and (a) reassign user_id to another user, or (b) freely change
-- seed / tournament_id on their own row. Low impact in practice (bracket
-- generation reassigns a clean 1..N seed anyway, and seed/tournament_id writes go
-- through staff-only server actions), but we harden it properly.

-- 1) Re-create the policy WITH CHECK so an owner can never reassign user_id away
--    from themselves (and staff can still edit any row).
drop policy if exists "participants_update_owner_or_staff" on participants;
create policy "participants_update_owner_or_staff" on participants
  for update using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- 2) WITH CHECK alone still lets an owner mutate seed / tournament_id on their own
--    row. Those columns are only legitimately written by staff (saveSeeds /
--    generateBracket run under a staff JWT, so public.is_staff() is true there).
--    Block non-staff from changing the protected columns via a BEFORE UPDATE
--    trigger. SECURITY INVOKER (default): it only reads OLD/NEW and calls the
--    existing is_staff() helper, so it needs no elevated privileges.
--
--    checked_in_at is deliberately NOT in this list: the SECURITY DEFINER
--    check_in() RPC sets it for a non-staff owner (online/station self check-in),
--    so blocking owner writes to it here would break that RPC. checked_in_at is
--    already gated by trg_checkin_requires_consent (consent enforcement).
create or replace function public.guard_participant_protected_fields()
returns trigger language plpgsql as $$
begin
  if public.is_staff() then
    return new; -- staff may edit any column
  end if;
  if new.user_id is distinct from old.user_id
     or new.tournament_id is distinct from old.tournament_id
     or new.seed is distinct from old.seed
     or new.qr_token is distinct from old.qr_token then
    raise exception 'not allowed to modify protected participant fields (user_id, tournament_id, seed, qr_token)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_participants_guard_protected on participants;
create trigger trg_participants_guard_protected
  before update on participants
  for each row execute function public.guard_participant_protected_fields();
