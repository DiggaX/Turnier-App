-- Multi-Tenancy 2a hardening: org-scope the confirm_match RPC.
-- confirm_match is SECURITY DEFINER (bypasses RLS), so the org-isolation that the
-- matches_write_staff RLS policy provides for direct writes does NOT apply inside
-- it — a staff member of org B could otherwise confirm a match of org A by id.
-- Add an explicit check: the match's tournament must belong to the caller's org.
create or replace function public.confirm_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; v_winner uuid; v_loser uuid; v_next_status text; v_lnext_status text;
begin
  if not public.is_staff() then raise exception 'only staff may confirm results'; end if;
  select * into m from matches where id = p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  -- Multi-tenant isolation: only confirm matches in the caller's own organization.
  if not exists (
    select 1 from tournaments t
    where t.id = m.tournament_id and t.org_id = public.current_org_id()
  ) then
    raise exception 'match belongs to another organization';
  end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  if p_score_a = p_score_b then raise exception 'draw not allowed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null then raise exception 'match has an empty slot'; end if;
  v_winner := case when p_score_a > p_score_b then m.participant_a_id else m.participant_b_id end;
  v_loser  := case when p_score_a > p_score_b then m.participant_b_id else m.participant_a_id end;
  if m.next_match_id is not null then
    select status into v_next_status from matches where id = m.next_match_id;
    if v_next_status = 'done' then raise exception 'Folge-Match bereits entschieden — bitte zuerst dort korrigieren'; end if;
  end if;
  if m.loser_next_match_id is not null then
    select status into v_lnext_status from matches where id = m.loser_next_match_id;
    if v_lnext_status = 'done' then raise exception 'Loser-Bracket-Folgematch bereits entschieden — bitte zuerst dort korrigieren'; end if;
  end if;
  update matches set score_a = p_score_a, score_b = p_score_b, winner_id = v_winner, status = 'done' where id = p_match_id;
  if m.next_match_id is not null then
    if m.next_slot = 'a' then update matches set participant_a_id = v_winner where id = m.next_match_id;
    elsif m.next_slot = 'b' then update matches set participant_b_id = v_winner where id = m.next_match_id;
    end if;
  end if;
  if m.loser_next_match_id is not null then
    if m.loser_next_slot = 'a' then update matches set participant_a_id = v_loser where id = m.loser_next_match_id;
    elsif m.loser_next_slot = 'b' then update matches set participant_b_id = v_loser where id = m.loser_next_match_id;
    end if;
  end if;
end;
$$;
grant execute on function public.confirm_match(uuid, int, int) to authenticated;
