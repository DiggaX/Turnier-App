-- Live scores are public display data only. Official results remain score_a /
-- score_b and are still written exclusively by confirm_match().
alter table public.matches
  add column live_score_a int check (live_score_a >= 0),
  add column live_score_b int check (live_score_b >= 0),
  add column live_started_at timestamptz,
  add column live_ended_at timestamptz,
  add column live_updated_at timestamptz;

-- QR bearer tokens must never be selected through the public matches endpoint.
-- Every match receives one opaque UUID; only SECURITY DEFINER RPCs can look it up.
create table public.match_scorekeeper_tokens (
  match_id uuid primary key references public.matches (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.match_scorekeeper_tokens enable row level security;
revoke all on table public.match_scorekeeper_tokens from public, anon, authenticated;

create or replace function public.create_match_scorekeeper_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.match_scorekeeper_tokens (match_id)
  values (new.id)
  on conflict (match_id) do nothing;
  return new;
end;
$$;

drop trigger if exists matches_create_scorekeeper_token on public.matches;
create trigger matches_create_scorekeeper_token
after insert on public.matches
for each row execute function public.create_match_scorekeeper_token();

-- Existing brackets need a QR token as well; new matches are covered by the trigger.
insert into public.match_scorekeeper_tokens (match_id)
select id from public.matches
on conflict (match_id) do nothing;

create or replace function public.get_scorekeeper_match(p_token uuid)
returns table (
  match_id uuid,
  tournament_name text,
  participant_a_name text,
  participant_b_name text,
  status public.match_status,
  live_score_a int,
  live_score_b int,
  live_started_at timestamptz,
  live_ended_at timestamptz,
  live_updated_at timestamptz,
  score_a int,
  score_b int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    t.name,
    a.display_name,
    b.display_name,
    m.status,
    m.live_score_a,
    m.live_score_b,
    m.live_started_at,
    m.live_ended_at,
    m.live_updated_at,
    m.score_a,
    m.score_b
  from public.match_scorekeeper_tokens st
  join public.matches m on m.id = st.match_id
  join public.tournaments t on t.id = m.tournament_id
  left join public.participants a on a.id = m.participant_a_id
  left join public.participants b on b.id = m.participant_b_id
  where st.token = p_token;
$$;

create or replace function public.start_live_match(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  select m.* into v_match
  from public.matches m
  join public.match_scorekeeper_tokens st on st.match_id = m.id
  where st.token = p_token
  for update of m;

  if v_match.id is null then raise exception 'scorekeeper link invalid'; end if;
  if v_match.status in ('done', 'bye') then raise exception 'match already decided'; end if;
  if v_match.status = 'live' and v_match.live_ended_at is not null then
    raise exception 'match already ended';
  end if;
  if v_match.status = 'live' then return; end if;

  update public.matches
  set status = 'live',
      live_score_a = 0,
      live_score_b = 0,
      live_started_at = now(),
      live_ended_at = null,
      live_updated_at = now()
  where id = v_match.id;
end;
$$;

create or replace function public.update_live_score(
  p_token uuid,
  p_score_a int,
  p_score_b int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'invalid live score';
  end if;

  select m.* into v_match
  from public.matches m
  join public.match_scorekeeper_tokens st on st.match_id = m.id
  where st.token = p_token
  for update of m;

  if v_match.id is null then raise exception 'scorekeeper link invalid'; end if;
  if v_match.status in ('done', 'bye') then raise exception 'match already decided'; end if;
  if v_match.status <> 'live' then raise exception 'match not started'; end if;
  if v_match.live_ended_at is not null then raise exception 'match already ended'; end if;

  update public.matches
  set live_score_a = p_score_a,
      live_score_b = p_score_b,
      live_updated_at = now()
  where id = v_match.id;
end;
$$;

create or replace function public.finish_live_match(
  p_token uuid,
  p_score_a int,
  p_score_b int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'invalid live score';
  end if;

  select m.* into v_match
  from public.matches m
  join public.match_scorekeeper_tokens st on st.match_id = m.id
  where st.token = p_token
  for update of m;

  if v_match.id is null then raise exception 'scorekeeper link invalid'; end if;
  if v_match.status in ('done', 'bye') then raise exception 'match already decided'; end if;
  if v_match.status <> 'live' then raise exception 'match not started'; end if;
  if v_match.live_ended_at is not null then raise exception 'match already ended'; end if;

  update public.matches
  set live_score_a = p_score_a,
      live_score_b = p_score_b,
      live_ended_at = now(),
      live_updated_at = now()
  where id = v_match.id;
end;
$$;

create or replace function public.reopen_live_match(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  select m.* into v_match
  from public.matches m
  join public.match_scorekeeper_tokens st on st.match_id = m.id
  where st.token = p_token
  for update of m;

  if v_match.id is null then raise exception 'scorekeeper link invalid'; end if;
  if v_match.status in ('done', 'bye') then raise exception 'match already decided'; end if;
  if v_match.status <> 'live' then raise exception 'match not started'; end if;

  update public.matches
  set live_ended_at = null,
      live_updated_at = now()
  where id = v_match.id;
end;
$$;

-- Organizer pages need the QR values, but direct reads of the token table stay
-- prohibited. The org guard prevents a staff member from retrieving links for
-- matches in another organization.
create or replace function public.get_scorekeeper_tokens(p_match_ids uuid[])
returns table (match_id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'only staff may read scorekeeper links'; end if;

  return query
  select st.match_id, st.token
  from public.match_scorekeeper_tokens st
  join public.matches m on m.id = st.match_id
  join public.tournaments t on t.id = m.tournament_id
  where st.match_id = any(p_match_ids)
    and t.org_id = public.current_org_id();
end;
$$;

revoke all on function public.create_match_scorekeeper_token() from public;
revoke all on function public.get_scorekeeper_match(uuid) from public;
revoke all on function public.start_live_match(uuid) from public;
revoke all on function public.update_live_score(uuid, int, int) from public;
revoke all on function public.finish_live_match(uuid, int, int) from public;
revoke all on function public.reopen_live_match(uuid) from public;
revoke all on function public.get_scorekeeper_tokens(uuid[]) from public;

grant execute on function public.get_scorekeeper_match(uuid) to anon, authenticated;
grant execute on function public.start_live_match(uuid) to anon, authenticated;
grant execute on function public.update_live_score(uuid, int, int) to anon, authenticated;
grant execute on function public.finish_live_match(uuid, int, int) to anon, authenticated;
grant execute on function public.reopen_live_match(uuid) to anon, authenticated;
grant execute on function public.get_scorekeeper_tokens(uuid[]) to authenticated;
