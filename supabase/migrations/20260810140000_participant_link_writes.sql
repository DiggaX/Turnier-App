-- Der geteilte Teilnehmer-Link darf jetzt auch schreiben.
--
-- Kinder werden meist auf dem Eltern-Handy angemeldet, und die Eltern gehen
-- wieder. Bisher war `/t/[id]/me?token=` deshalb read-only: Status und QR ja,
-- einchecken und Ergebnis melden nein. Beides hängt an `auth.uid()`, und ein
-- zweites Gerät kann diese Session nicht bekommen — Teilnehmer sind anonyme
-- Auth-User ohne E-Mail, denen sich kein Magic Link schicken lässt.
--
-- Also dieselbe Prüfung wie in get_participant_by_qr_token: der qr_token IST
-- bereits der Ausweis des Teilnehmers (die Orga scannt ihn zum Einchecken).
-- Wer ihn hat, konnte sich damit ohnehin an der Theke einchecken lassen; das
-- hier nimmt nur den Umweg über die Theke raus.
--
-- Ergebnismeldung bewusst mit dabei, obwohl der Link weiterleitbar ist: eine
-- Meldung ist nur eine Meldung. Das Ergebnis setzt die Orga über confirm_match,
-- die beide Meldungen sieht. Der Schaden eines fremden Eintrags ist ein
-- Streitfall, kein falsches Ergebnis.
--
-- Kein neuer checkin_method-Wert: `online` passt, und die Link-Herkunft steht
-- ohnehin in der Zeile — checked_in_by ist hier NULL, bei einem Check-in aus
-- der eigenen Session die uid des Teilnehmers.

-- Check-in über den Link.
create or replace function public.check_in_via_token(p_qr_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_pid uuid; v_already timestamptz;
begin
  select id, checked_in_at into v_pid, v_already
  from participants where qr_token = p_qr_token;
  if v_pid is null then raise exception 'participant not found'; end if;

  -- Idempotent, anders als check_in(). Diese Funktion ist für anon aufrufbar,
  -- und ohne das könnte jeder Linkinhaber die check_ins-Historie vollschreiben.
  if v_already is not null then return; end if;

  update participants set checked_in_at = now() where id = v_pid;

  -- checked_in_by bleibt absichtlich NULL: welche Session der Browser gerade
  -- trägt, ist irgendwer — nur nicht der Teilnehmer. Eintragen hieße, die
  -- falsche Person zu protokollieren.
  insert into check_ins (participant_id, method, checked_in_by)
  values (v_pid, 'online', null);
end;
$$;

grant execute on function public.check_in_via_token(uuid) to anon, authenticated;

-- Ergebnis melden über den Link. Spiegelt report_match(), nur dass der
-- Teilnehmer über den Token statt über auth.uid() gefunden wird.
create or replace function public.report_match_via_token(
  p_qr_token uuid,
  p_match_id uuid,
  p_score_a int,
  p_score_b int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_pid uuid;
begin
  select p.id into v_pid
  from matches m
  join participants p on p.id in (m.participant_a_id, m.participant_b_id)
  where m.id = p_match_id and p.qr_token = p_qr_token
  limit 1;
  if v_pid is null then raise exception 'not a participant in this match'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;

  insert into match_reports (match_id, reported_by, score_a, score_b)
  values (p_match_id, v_pid, p_score_a, p_score_b)
  on conflict (match_id, reported_by)
    do update set score_a = excluded.score_a,
                  score_b = excluded.score_b,
                  created_at = now();
end;
$$;

grant execute on function public.report_match_via_token(uuid, uuid, int, int) to anon, authenticated;

-- Das offene Match samt eigener Meldung, über den Token.
--
-- matches ist öffentlich lesbar, match_reports nicht: dessen Policy verlangt
-- p.user_id = auth.uid(). Im Token-Modus gibt es die Session nicht, also käme
-- die bereits abgegebene Meldung nie an — das Formular stünde bei jedem Aufruf
-- wieder leer und würde eine Korrektur wie eine Erstmeldung aussehen lassen.
create or replace function public.get_open_match_by_qr_token(p_qr_token uuid)
returns table (
  match_id uuid,
  opponent_name text,
  my_side text,
  report_score_a int,
  report_score_b int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from participants where qr_token = p_qr_token
  ),
  open_match as (
    -- Kein Turnierfilter nötig: der Token trifft genau einen Teilnehmer, und
    -- der gehört zu genau einem Turnier.
    select m.id, m.participant_a_id, m.participant_b_id
    from matches m, me
    where m.status in ('pending', 'live')
      and m.participant_a_id is not null
      and m.participant_b_id is not null
      and me.id in (m.participant_a_id, m.participant_b_id)
    order by m.round, m.slot
    limit 1
  )
  select
    om.id,
    coalesce(opp.display_name, 'Gegner'),
    case when om.participant_a_id = me.id then 'a' else 'b' end,
    r.score_a,
    r.score_b
  from open_match om
  cross join me
  left join participants opp
    on opp.id = case when om.participant_a_id = me.id
                     then om.participant_b_id
                     else om.participant_a_id end
  left join match_reports r
    on r.match_id = om.id and r.reported_by = me.id;
$$;

grant execute on function public.get_open_match_by_qr_token(uuid) to anon, authenticated;
