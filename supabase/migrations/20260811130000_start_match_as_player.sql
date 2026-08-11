-- Ein Spieler darf seine eigene Partie starten, wenn kein Scorekeeper da ist.
--
-- Die getroffene Regel lautet: wer vor Ort ist, startet. Ist ein Scorekeeper am
-- Platz, macht er es ueber seinen Link; ist keiner da, irgendwer aus dem Team
-- ueber "Mein Status". Bisher ging nur der erste Weg. start_live_match haengt an
-- einem Token aus match_scorekeeper_tokens, und der einzige Leseweg dorthin ist
-- get_scorekeeper_tokens, das mit `if not public.is_staff() then raise` beginnt.
-- Ein Spieler kann den Token also weder lesen noch erraten.
--
-- Warum das mehr ist als Bequemlichkeit: eine gestartete Partie ist der einzige
-- Weg, auf dem die Warteschlange auf "Mein Status" erfaehrt, dass gerade
-- gespielt wird. Ohne Start zaehlt sie die laufende Partie als wartend weiter,
-- und alle dahinter bekommen eine Schaetzung, die eine Partie zu lang ist.
--
-- Bewusst NUR starten, nicht mitzaehlen und nicht beenden:
--   * Zaehlen (update_live_score) ist die Arbeit des Scorekeepers. Ein zweiter,
--     paralleler Zaehlweg aus dem Team heraus wuerde sich mit ihm ueberschreiben.
--   * Beenden (finish_live_match) setzt live_ended_at, und daraus baut
--     scorePrefill den Vorschlag fuer die Freigabe. Der Weg der Spieler dorthin
--     ist report_match: melden beide Seiten dasselbe, gewinnt ihre Einigkeit
--     ohnehin vor dem Scorekeeper-Vorschlag (siehe lib/station/station.ts).
--     Zwei Quellen fuer dieselbe Vorbelegung waeren eine zuviel.
--
-- Die Wachen sind woertlich dieselben wie in start_live_match — entschiedene
-- Partie, bereits beendete Partie, und der zweite Start ist ein stilles No-op
-- statt eines Fehlers. Wer in einer Halle zweimal auf denselben Knopf tippt,
-- weil die erste Antwort lange brauchte, soll keine Fehlermeldung sehen.
--
-- Ein Parameter statt zweier Funktionen: /t/[id]/me laeuft in zwei Modi, mit
-- Sitzung und ueber ?token=. Ohne Token entscheidet auth.uid(), mit Token der
-- Token — anon hat kein auth.uid(), kann den Sitzungszweig also nicht missbrauchen.
-- Autorisiert wird wie in report_match_via_token: ueber den WETTKAEMPFER,
-- coalesce(team_id, id), denn im Match steht bei einem Team die Team-Zeile.

create or replace function public.start_match_as_player(
  p_match_id uuid,
  p_qr_token uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match      matches;
  v_competitor uuid;
begin
  select m.* into v_match from matches m where m.id = p_match_id for update;
  if v_match.id is null then
    raise exception 'Diese Partie gibt es nicht.' using errcode = 'P0002';
  end if;

  select coalesce(p.team_id, p.id) into v_competitor
  from participants p
  where p.tournament_id = v_match.tournament_id
    and (
      (p_qr_token is not null and p.qr_token = p_qr_token)
      or (p_qr_token is null and auth.uid() is not null and p.user_id = auth.uid())
    )
    and coalesce(p.team_id, p.id) in (v_match.participant_a_id, v_match.participant_b_id)
  limit 1;

  if v_competitor is null then
    raise exception 'Du spielst in dieser Partie nicht mit.' using errcode = '42501';
  end if;

  if v_match.status in ('done', 'bye') then
    raise exception 'Diese Partie ist schon entschieden.' using errcode = '22023';
  end if;
  if v_match.status = 'live' and v_match.live_ended_at is not null then
    raise exception 'Diese Partie ist schon beendet.' using errcode = '22023';
  end if;
  if v_match.status = 'live' then
    return; -- laeuft bereits, zweiter Tipp bleibt folgenlos
  end if;

  update matches
     set status          = 'live',
         live_score_a    = 0,
         live_score_b    = 0,
         live_started_at = now(),
         live_ended_at   = null,
         live_updated_at = now()
   where id = v_match.id;
end;
$$;

revoke all on function public.start_match_as_player(uuid, uuid) from public;
grant execute on function public.start_match_as_player(uuid, uuid) to anon, authenticated;

comment on function public.start_match_as_player(uuid, uuid) is
  'Startet die eigene Partie ohne Scorekeeper-Token. Autorisiert ueber den Wettkaempfer coalesce(team_id, id) — mit Sitzung ueber auth.uid(), im Link-Modus ueber p_qr_token. Nur starten: zaehlen und beenden bleiben beim Scorekeeper.';
