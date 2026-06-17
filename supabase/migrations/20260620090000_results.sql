-- Plan 5: Ergebnisse & Schiri-Flow — per-side reports, final scores, confirm + advancement RPCs

alter table matches add column score_a int;
alter table matches add column score_b int;

create table match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  reported_by uuid not null references participants (id) on delete cascade,
  score_a int not null check (score_a >= 0),
  score_b int not null check (score_b >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, reported_by)
);
alter table match_reports enable row level security;
-- staff OR one of the match's two participant-owners may read. Writes go through report_match() only.
create policy "match_reports_select" on match_reports for select using (
  public.is_staff() or exists (
    select 1 from matches m
    join participants p on p.id in (m.participant_a_id, m.participant_b_id)
    where m.id = match_id and p.user_id = auth.uid()
  )
);

-- a match participant submits/updates their own report
create or replace function public.report_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  select p.id into v_pid from matches m
    join participants p on p.id in (m.participant_a_id, m.participant_b_id)
    where m.id = p_match_id and p.user_id = auth.uid()
    limit 1;
  if v_pid is null then raise exception 'not a participant in this match'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  insert into match_reports (match_id, reported_by, score_a, score_b)
    values (p_match_id, v_pid, p_score_a, p_score_b)
    on conflict (match_id, reported_by)
      do update set score_a = excluded.score_a, score_b = excluded.score_b, created_at = now();
end;
$$;
grant execute on function public.report_match(uuid, int, int) to anon, authenticated;

-- staff confirms / directly enters the final result; sets winner, done, advances winner (single-elim)
create or replace function public.confirm_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; v_winner uuid;
begin
  if not public.is_staff() then raise exception 'only staff may confirm results'; end if;
  select * into m from matches where id = p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  if p_score_a = p_score_b then raise exception 'draw not allowed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null then raise exception 'match has an empty slot'; end if;
  v_winner := case when p_score_a > p_score_b then m.participant_a_id else m.participant_b_id end;
  update matches set score_a = p_score_a, score_b = p_score_b, winner_id = v_winner, status = 'done' where id = p_match_id;
  if m.next_match_id is not null then
    if m.next_slot = 'a' then update matches set participant_a_id = v_winner where id = m.next_match_id;
    elsif m.next_slot = 'b' then update matches set participant_b_id = v_winner where id = m.next_match_id;
    end if;
  end if;
end;
$$;
grant execute on function public.confirm_match(uuid, int, int) to authenticated;
