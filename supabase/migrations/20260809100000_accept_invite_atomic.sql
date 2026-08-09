-- Make redeeming an invite atomic.
--
-- The old body read the invite, checked `accepted_at is null`, created the
-- profile and only then marked the invite used. Two people opening the same
-- invite link at the same moment both passed the check and both got a profile,
-- so one code admitted two members. Same select-then-update mistake that
-- device_pairings was fixed for.
--
-- Now a single conditional UPDATE decides it. `code` is UNIQUE, so both callers
-- contend for one row; the loser waits, re-evaluates the WHERE once the winner
-- commits, matches nothing and raises -- which rolls back its own profile row
-- along with everything else in the call. The checks above are kept only to
-- tell invalid from expired from already-used; they decide nothing.
--
-- The profile has to be inserted before the UPDATE, not after: org_invites
-- .accepted_by carries a foreign key to profiles(id), so setting it first
-- would fail the constraint.
--
-- Second fix in the same body: org_invites.role is text, profiles.role is the
-- user_role enum, and Postgres has no assignment cast between them -- the
-- insert raised 42804 on every call, so redeeming an invite could never have
-- worked. It went unnoticed because no invite had ever been created (0 rows in
-- org_invites when this was found on 2026-08-09). Hence the explicit cast; the
-- CHECK on org_invites.role already limits it to 'organizer'/'referee', both
-- of which exist in user_role.
create or replace function public.accept_invite(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_inv org_invites; v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'bereits einer Organisation zugeordnet'; end if;

  -- Wording only. Never the decision.
  select * into v_inv from org_invites where code = p_code;
  if v_inv.id is null then raise exception 'Einladung ungueltig'; end if;
  if v_inv.accepted_at is not null then raise exception 'Einladung bereits eingeloest'; end if;
  if v_inv.expires_at < now() then raise exception 'Einladung abgelaufen'; end if;

  insert into profiles (id, role, org_id) values (v_uid, v_inv.role::user_role, v_inv.org_id);

  -- The decision. A second redeemer of the same code lands here and loses.
  update org_invites
     set accepted_at = now(), accepted_by = v_uid
   where code = p_code and accepted_at is null and expires_at > now()
  returning * into v_inv;
  if v_inv.id is null then raise exception 'Einladung bereits eingeloest'; end if;

  select slug into v_slug from organizations where id = v_inv.org_id;
  return v_slug;
end; $$;
