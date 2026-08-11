-- Ergebnismeldung: der Mensch meldet, das Team steht im Spielplan.
--
-- Ohne diese Datei nimmt der Umbau ein funktionierendes Feature mit. report_match
-- und report_match_via_token suchen heute die Teilnehmer-Zeile, die im Match
-- steht, und pruefen, ob sie dem Aufrufer gehoert:
--
--     join participants p on p.id in (m.participant_a_id, m.participant_b_id)
--     where p.user_id = auth.uid()
--
-- Bei einem Einzelturnier bleibt das richtig. Bei einem Teamturnier steht ab
-- jetzt die Team-Zeile im Match, und die traegt keinen user_id — der Aufrufer ist
-- die Person daneben. Die Bedingung findet nichts, und jeder Spieler bekaeme
-- "not a participant in this match". Niemand koennte mehr ein Ergebnis melden.
--
-- Die Aufloesung ist ueberall dieselbe und heisst hier "Wettkaempfer":
--
--     coalesce(p.team_id, p.id)
--
-- Fuer einen Einzelstarter ist das die eigene Zeile, fuer ein Teammitglied die
-- seines Teams. Damit bleibt `unique (match_id, reported_by)` das, was es sein
-- soll: eine Stimme pro Seite.
--
-- Genau eine Stimme pro Team ist die getroffene Entscheidung, nicht ein
-- Versehen: nicht jeder hat am Turniertag sein Handy dabei, deshalb darf JEDES
-- Mitglied melden und die Meldung bis zur Freigabe auch noch korrigieren. Wer
-- zuletzt getippt hat, steht in reported_by_person — das `on conflict do update`
-- ueberschreibt sonst still, und bei einer Rueckfrage muss die Orga wissen, wen
-- sie fragen kann.

alter table match_reports
  add column if not exists reported_by_person uuid references participants(id) on delete set null;

create index if not exists match_reports_reported_by_person_idx
  on match_reports (reported_by_person) where reported_by_person is not null;

comment on column match_reports.reported_by_person is
  'Wer die Meldung zuletzt abgesetzt hat. reported_by ist der Wettkaempfer (bei Teams die Team-Zeile), diese Spalte der Mensch dahinter. Reines Protokoll — der Unique-Key bleibt (match_id, reported_by).';

-- ---------------------------------------------------------------------------
create or replace function public.report_match(p_match_id uuid, p_score_a integer, p_score_b integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person     uuid;
  v_competitor uuid;
begin
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'invalid score';
  end if;

  select p.id, coalesce(p.team_id, p.id)
    into v_person, v_competitor
  from matches m
  join participants p on p.tournament_id = m.tournament_id
  where m.id = p_match_id
    and p.user_id = auth.uid()
    and coalesce(p.team_id, p.id) in (m.participant_a_id, m.participant_b_id)
  limit 1;

  if v_competitor is null then
    raise exception 'not a participant in this match';
  end if;

  insert into match_reports (match_id, reported_by, reported_by_person, score_a, score_b)
  values (p_match_id, v_competitor, v_person, p_score_a, p_score_b)
  on conflict (match_id, reported_by)
    do update set score_a            = excluded.score_a,
                  score_b            = excluded.score_b,
                  reported_by_person = excluded.reported_by_person,
                  created_at         = now();
end;
$$;

revoke all on function public.report_match(uuid, integer, integer) from public, anon;
grant execute on function public.report_match(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Dieselbe Aufloesung fuer den Weg ueber den geteilten Link. anon behaelt hier
-- das Ausfuehrungsrecht: der Token IST der Ausweis, die Seite /t/[id]/me?token=…
-- laeuft ohne Sitzung.
create or replace function public.report_match_via_token(
  p_qr_token uuid, p_match_id uuid, p_score_a integer, p_score_b integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person     uuid;
  v_competitor uuid;
begin
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'invalid score';
  end if;

  select p.id, coalesce(p.team_id, p.id)
    into v_person, v_competitor
  from matches m
  join participants p on p.tournament_id = m.tournament_id
  where m.id = p_match_id
    and p.qr_token = p_qr_token
    and coalesce(p.team_id, p.id) in (m.participant_a_id, m.participant_b_id)
  limit 1;

  if v_competitor is null then
    raise exception 'not a participant in this match';
  end if;

  insert into match_reports (match_id, reported_by, reported_by_person, score_a, score_b)
  values (p_match_id, v_competitor, v_person, p_score_a, p_score_b)
  on conflict (match_id, reported_by)
    do update set score_a            = excluded.score_a,
                  score_b            = excluded.score_b,
                  reported_by_person = excluded.reported_by_person,
                  created_at         = now();
end;
$$;

revoke all on function public.report_match_via_token(uuid, uuid, integer, integer) from public;
grant execute on function public.report_match_via_token(uuid, uuid, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Und die Lesefunktion dazu: welches Match ist offen, und was habe ich (bzw. mein
-- Team) dafuer schon gemeldet. Ohne dieselbe Aufloesung fiele die Karte auf
-- "Mein Status" bei Teamturnieren einfach weg.
create or replace function public.get_open_match_by_qr_token(p_qr_token uuid)
returns table (
  match_id       uuid,
  opponent_name  text,
  my_side        text,
  report_score_a integer,
  report_score_b integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select coalesce(p.team_id, p.id) as id
    from participants p
    where p.qr_token = p_qr_token
  ),
  open_match as (
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

revoke all on function public.get_open_match_by_qr_token(uuid) from public;
grant execute on function public.get_open_match_by_qr_token(uuid) to anon, authenticated;
