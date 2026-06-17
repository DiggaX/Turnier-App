-- Plan 5 final-review fix I1: guard confirm_match against corrupting deeper rounds.
-- Re-confirming (score correction) is allowed even when the match is already 'done'.
-- Problem: correcting the winner of round N must re-advance into the next_match. If the
-- next_match is already 'done', the corrected winner can no longer be propagated without
-- leaving stale state in still-deeper rounds.
-- Fix: if next_match is already 'done', refuse and require correcting it there first.
-- Otherwise overwrite the (possibly stale) advanced participant in the correct next_slot.

create or replace function public.confirm_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; v_winner uuid; v_next_status text;
begin
  if not public.is_staff() then raise exception 'only staff may confirm results'; end if;
  select * into m from matches where id = p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  if p_score_a = p_score_b then raise exception 'draw not allowed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null then raise exception 'match has an empty slot'; end if;
  v_winner := case when p_score_a > p_score_b then m.participant_a_id else m.participant_b_id end;

  -- Guard: a score correction that changes advancement cannot proceed if the follow-up
  -- match is already decided — fixing it here would strand a stale winner downstream.
  if m.next_match_id is not null then
    select status into v_next_status from matches where id = m.next_match_id;
    if v_next_status = 'done' then
      raise exception 'Folge-Match bereits entschieden — bitte zuerst dort korrigieren';
    end if;
  end if;

  update matches set score_a = p_score_a, score_b = p_score_b, winner_id = v_winner, status = 'done' where id = p_match_id;

  if m.next_match_id is not null then
    -- overwrite any previously-advanced (possibly stale) winner; next_match is not 'done' per guard above
    if m.next_slot = 'a' then update matches set participant_a_id = v_winner where id = m.next_match_id;
    elsif m.next_slot = 'b' then update matches set participant_b_id = v_winner where id = m.next_match_id;
    end if;
  end if;
end;
$$;
grant execute on function public.confirm_match(uuid, int, int) to authenticated;
