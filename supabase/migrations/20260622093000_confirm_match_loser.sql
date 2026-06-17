-- Plan 7: Double Elimination — confirm_match also drops the LOSER into the loser bracket
-- (loser_next_match_id / loser_next_slot), keeping the Plan 5 downstream-correction guard
-- for both the winner's and the loser's follow-up matches.
create or replace function public.confirm_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; v_winner uuid; v_loser uuid; v_next_status text; v_lnext_status text;
begin
  if not public.is_staff() then raise exception 'only staff may confirm results'; end if;
  select * into m from matches where id = p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  if p_score_a = p_score_b then raise exception 'draw not allowed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null then raise exception 'match has an empty slot'; end if;
  v_winner := case when p_score_a > p_score_b then m.participant_a_id else m.participant_b_id end;
  v_loser  := case when p_score_a > p_score_b then m.participant_b_id else m.participant_a_id end;

  -- Guard: winner's follow-up not already decided
  if m.next_match_id is not null then
    select status into v_next_status from matches where id = m.next_match_id;
    if v_next_status = 'done' then raise exception 'Folge-Match bereits entschieden — bitte zuerst dort korrigieren'; end if;
  end if;
  -- Guard: loser's drop target (double-elim) not already decided
  if m.loser_next_match_id is not null then
    select status into v_lnext_status from matches where id = m.loser_next_match_id;
    if v_lnext_status = 'done' then raise exception 'Loser-Bracket-Folgematch bereits entschieden — bitte zuerst dort korrigieren'; end if;
  end if;

  update matches set score_a = p_score_a, score_b = p_score_b, winner_id = v_winner, status = 'done' where id = p_match_id;

  -- advance winner
  if m.next_match_id is not null then
    if m.next_slot = 'a' then update matches set participant_a_id = v_winner where id = m.next_match_id;
    elsif m.next_slot = 'b' then update matches set participant_b_id = v_winner where id = m.next_match_id;
    end if;
  end if;
  -- drop loser into the loser bracket (double elimination)
  if m.loser_next_match_id is not null then
    if m.loser_next_slot = 'a' then update matches set participant_a_id = v_loser where id = m.loser_next_match_id;
    elsif m.loser_next_slot = 'b' then update matches set participant_b_id = v_loser where id = m.loser_next_match_id;
    end if;
  end if;
end;
$$;
grant execute on function public.confirm_match(uuid, int, int) to authenticated;
