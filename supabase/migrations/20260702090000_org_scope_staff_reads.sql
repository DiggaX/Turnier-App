-- SECURITY HARDENING — org-scope the staff branch of cross-tenant SELECT policies.
--
-- Several SELECT policies (and the qr_scan check-in RPC + the consent-signature
-- storage read) gated only on bare `is_staff()`, which is TRUE for any staff
-- member of ANY organization. Combined with public-board-discoverable
-- participant ids, that let a staff user of Org A read other orgs' PII:
--   - consents.grantor_name + signature image (player/guardian real names, minors)
--   - team_members.name / gamertag (roster real names)
--   - push_subscriptions endpoint + p256dh/auth (per-device push keys)
-- and falsify another org's check-in state via check_in(..., 'qr_scan').
--
-- Fix: confine the staff branch to the caller's own org via
-- `is_staff_of_participant_org()` (mirrors the already-correct participants /
-- matches / tournaments policies). The own-participant self-read paths are
-- preserved unchanged. games stays global by design (no PII, organizer game
-- management relies on it) and is intentionally not touched here.

-- Helper: caller is staff AND the participant belongs to a tournament in the
-- caller's own org. SECURITY DEFINER so the participant→tournament lookup is not
-- itself subject to RLS recursion.
create or replace function public.is_staff_of_participant_org(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_staff() and exists (
    select 1
    from participants p
    join tournaments t on t.id = p.tournament_id
    where p.id = p_participant_id
      and t.org_id = public.current_org_id()
  );
$$;

-- consents: own consent (self) OR staff of the participant's org.
drop policy if exists "consents_select" on consents;
create policy "consents_select" on consents
  for select using (
    public.is_staff_of_participant_org(participant_id)
    or exists (
      select 1 from participants p
      where p.id = consents.participant_id and p.user_id = auth.uid()
    )
  );

-- team_members: own participant OR staff of the participant's org.
drop policy if exists "team_members_select" on team_members;
create policy "team_members_select" on team_members
  for select using (
    public.is_staff_of_participant_org(participant_id)
    or exists (
      select 1 from participants p
      where p.id = team_members.participant_id and p.user_id = auth.uid()
    )
  );

-- check_ins: own participant OR staff of the participant's org.
drop policy if exists "check_ins_select" on check_ins;
create policy "check_ins_select" on check_ins
  for select using (
    public.is_staff_of_participant_org(participant_id)
    or exists (
      select 1 from participants p
      where p.id = check_ins.participant_id and p.user_id = auth.uid()
    )
  );

-- match_reports: own (a participant in the match) OR staff of the match's org.
drop policy if exists "match_reports_select" on match_reports;
create policy "match_reports_select" on match_reports
  for select using (
    (public.is_staff() and exists (
      select 1 from matches m
      join tournaments t on t.id = m.tournament_id
      where m.id = match_reports.match_id and t.org_id = public.current_org_id()
    ))
    or exists (
      select 1 from matches m
      join participants p on p.id in (m.participant_a_id, m.participant_b_id)
      where m.id = match_reports.match_id and p.user_id = auth.uid()
    )
  );

-- push_subscriptions: owner OR staff of the participant's org (SELECT + DELETE).
drop policy if exists "push_sub_owner_or_staff_select" on push_subscriptions;
create policy "push_sub_owner_or_staff_select" on push_subscriptions
  for select using (
    exists (
      select 1 from participants p
      where p.id = push_subscriptions.participant_id and p.user_id = auth.uid()
    )
    or public.is_staff_of_participant_org(participant_id)
  );

drop policy if exists "push_sub_owner_or_staff_delete" on push_subscriptions;
create policy "push_sub_owner_or_staff_delete" on push_subscriptions
  for delete using (
    exists (
      select 1 from participants p
      where p.id = push_subscriptions.participant_id and p.user_id = auth.uid()
    )
    or public.is_staff_of_participant_org(participant_id)
  );

-- consent-signature images (storage): the uploader (folder = own uid) OR staff
-- of the org that owns the consent whose signature_path equals the object name.
drop policy if exists "sig_select_own_or_staff" on storage.objects;
create policy "sig_select_own_or_staff" on storage.objects
  for select to authenticated using (
    bucket_id = 'consent-signatures'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        public.is_staff()
        and exists (
          select 1 from consents c
          join participants p on p.id = c.participant_id
          join tournaments t on t.id = p.tournament_id
          where c.signature_path = storage.objects.name
            and t.org_id = public.current_org_id()
        )
      )
    )
  );

-- check_in RPC: the qr_scan (staff) path must also be org-scoped, so staff of
-- Org A cannot check in / write check_ins for another org's participant.
create or replace function public.check_in(p_participant_id uuid, p_method checkin_method)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid; v_exists boolean;
begin
  select user_id, true into v_owner, v_exists from participants where id = p_participant_id;
  if v_exists is null then raise exception 'participant not found'; end if;
  if p_method = 'qr_scan' then
    if not public.is_staff_of_participant_org(p_participant_id) then
      raise exception 'only staff of this participant''s organization may scan-in participants';
    end if;
  else
    if v_owner is distinct from auth.uid() then raise exception 'you can only check in yourself'; end if;
  end if;
  update participants set checked_in_at = coalesce(checked_in_at, now()) where id = p_participant_id;
  insert into check_ins (participant_id, method, checked_in_by) values (p_participant_id, p_method, auth.uid());
end;
$$;
