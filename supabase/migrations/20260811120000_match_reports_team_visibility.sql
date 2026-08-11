-- Ein Teamspieler sieht seine eigene Meldung nicht. Das ist Folgeschaden des
-- Person/Team-Umbaus, und er trifft ausgerechnet die Rueckmeldung.
--
-- match_reports_select (20260702090000) laesst einen Teilnehmer durch, wenn er
-- auf einer der beiden Seiten der Partie steht:
--
--     join participants p on p.id in (m.participant_a_id, m.participant_b_id)
--     where p.user_id = auth.uid()
--
-- Bei einem Einzelturnier stimmt das. Bei einem Teamturnier steht in der Partie
-- die TEAM-Zeile, und die traegt user_id NULL — der Join trifft nie. Melden
-- funktioniert weiterhin (report_match ist SECURITY DEFINER und laeuft an RLS
-- vorbei), aber LESEN nicht: das Banner "Gemeldet: 2:1 — wartet auf Freigabe"
-- und die Vorbelegung der Eingabefelder erscheinen bei Teamspielern nie.
--
-- Wer gerade sein Ergebnis abgeschickt hat und danach dieselbe leere Maske
-- sieht, tippt es ein zweites Mal ein. Das ist genau die Sorte stiller Fehler,
-- bei der niemand einen Fehler meldet, weil es aussieht, als haette man sich
-- selbst vertan.
--
-- Die Aufloesung ist dieselbe wie ueberall sonst im Umbau, coalesce(team_id, id):
-- fuer einen Einzelstarter die eigene Zeile, fuer ein Teammitglied die seines
-- Teams. Damit deckt EIN Zweig beide Faelle ab, und der alte kann ersatzlos weg.
--
-- Der Staff-Zweig bleibt unveraendert.

drop policy if exists "match_reports_select" on match_reports;

create policy "match_reports_select" on match_reports
  for select
  using (
    (
      public.is_staff()
      and exists (
        select 1
        from matches m
        join tournaments t on t.id = m.tournament_id
        where m.id = match_reports.match_id
          and t.org_id = public.current_org_id()
      )
    )
    or exists (
      select 1
      from matches m
      join participants me
        on me.user_id = auth.uid()
       and me.tournament_id = m.tournament_id
      where m.id = match_reports.match_id
        and coalesce(me.team_id, me.id) in (m.participant_a_id, m.participant_b_id)
    )
  );

comment on policy "match_reports_select" on match_reports is
  'Staff der eigenen Org, plus der Mensch, dessen Wettkaempfer (coalesce(team_id, id)) in der Partie steht. Der zweite Zweig muss ueber den Wettkaempfer gehen, nicht ueber die eigene Zeile — bei einem Team steht die Team-Zeile im Match, und die hat kein user_id.';
