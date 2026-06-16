-- Plan 3: Check-in — audit table, personal QR token, DB consent gate, check_in() RPC

create type checkin_method as enum ('qr_scan', 'station', 'online');

-- personal QR token per participant (unguessable; encoded in the participant's QR)
alter table participants add column qr_token uuid not null default gen_random_uuid();
create unique index participants_qr_token_key on participants (qr_token);

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  method checkin_method not null,
  checked_in_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table check_ins enable row level security;
-- staff read all; a participant reads own. Inserts happen ONLY via the check_in() RPC
-- (SECURITY DEFINER); no INSERT policy => direct client inserts are denied by default.
create policy "check_ins_select" on check_ins
  for select using (
    public.is_staff() or exists (
      select 1 from participants p where p.id = participant_id and p.user_id = auth.uid()
    )
  );

-- valid media consent for the participant's age (adult: any consent; minor: guardian signature)
create or replace function public.participant_has_valid_consent(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from participants p
    join consents c on c.participant_id = p.id
    where p.id = p_id
      and (
        extract(year from age(p.birthdate)) >= 18
        or (c.grantor = 'guardian' and c.method = 'signature' and c.signature_path is not null)
      )
  );
$$;

-- DB GATE (review finding I2): block setting checked_in_at without valid consent
create or replace function public.enforce_consent_before_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.checked_in_at is not null and old.checked_in_at is null then
    if not public.participant_has_valid_consent(new.id) then
      raise exception 'check-in blocked: valid media consent required' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_checkin_requires_consent
  before update on participants
  for each row execute function public.enforce_consent_before_checkin();

-- single check-in entry point: authorize by method, write audit + set checked_in_at atomically.
-- online/station => caller must own the participant; qr_scan => caller must be staff.
create or replace function public.check_in(p_participant_id uuid, p_method checkin_method)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_exists boolean;
begin
  select user_id, true into v_owner, v_exists from participants where id = p_participant_id;
  if v_exists is null then raise exception 'participant not found'; end if;

  if p_method = 'qr_scan' then
    if not public.is_staff() then raise exception 'only staff may scan-in participants'; end if;
  else
    if v_owner is distinct from auth.uid() then raise exception 'you can only check in yourself'; end if;
  end if;

  update participants set checked_in_at = coalesce(checked_in_at, now()) where id = p_participant_id;
  insert into check_ins (participant_id, method, checked_in_by) values (p_participant_id, p_method, auth.uid());
end;
$$;
grant execute on function public.check_in(uuid, checkin_method) to anon, authenticated;
