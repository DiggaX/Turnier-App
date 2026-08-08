-- Tell the two scan channels apart in the audit trail.
--
-- Until now a camera scan and a handheld scan both landed as 'qr_scan', so when
-- a door station misbehaved the check_ins table could not say which reader had
-- produced the check-in. Existing rows keep 'qr_scan'; new ones name the reader.

alter type checkin_method add value if not exists 'camera_scan';
alter type checkin_method add value if not exists 'hardware_scan';

-- The authorization rule is unchanged in substance — self-service methods must
-- be the participant's own, scans must come from staff of that participant's
-- org — but it is now written as an allowlist of self-service methods. The old
-- form singled out 'qr_scan' as the staff path, which meant every method added
-- later silently became a self-check-in that any signed-in user could call for
-- their own participant. This way round a new method defaults to needing staff.
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

  if p_method in ('station', 'online') then
    if v_owner is distinct from auth.uid() then raise exception 'you can only check in yourself'; end if;
  else
    if not public.is_staff_of_participant_org(p_participant_id) then
      raise exception 'only staff of this participant''s organization may scan-in participants';
    end if;
  end if;

  update participants set checked_in_at = coalesce(checked_in_at, now()) where id = p_participant_id;
  insert into check_ins (participant_id, method, checked_in_by) values (p_participant_id, p_method, auth.uid());
end;
$$;
