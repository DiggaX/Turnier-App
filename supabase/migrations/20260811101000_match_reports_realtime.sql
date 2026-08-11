-- Eingehende Spielermeldungen erscheinen beim Schiedsrichter, ohne dass er
-- neu laedt.
--
-- Die Melde-Kette gibt es schon: beide Seiten melden ihr Ergebnis, stimmen sie
-- ueberein, fuellt agreedScore (web/src/lib/station/station.ts) das
-- Freigabe-Formular vor und zeigt "✓ Einig", sonst "⚠ Abweichung". Nur sieht der
-- Schiedsrichter davon nichts, bis er die Seite neu laedt — die Publikation
-- kennt bisher ausschliesslich matches und tournaments
-- (20260621090000_realtime.sql). In der Praxis heisst das: die Spieler melden,
-- am Tresen bleibt der Bildschirm leer, und jemand ruft durch die Halle.
--
-- Das ist sicher, weil Realtime die RLS des Empfaengers anwendet.
-- match_reports_select (20260702090000) laesst genau zwei Sorten durch:
-- Staff der eigenen Organisation, und den Teilnehmer, dem die Partie gehoert.
-- anon hat auf match_reports gar keine Policy und bekommt daher nichts —
-- anders als bei matches, wo matches_select_public bewusst `using (true)` ist.
--
-- Der Vollstaendigkeit halber: die Tabelle hat weiterhin keine INSERT-, UPDATE-
-- oder DELETE-Policy. Geschrieben wird ausschliesslich ueber report_match und
-- report_match_via_token. Diese Migration aendert daran nichts, sie macht nur
-- lesbar, was ohnehin lesbar war.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_reports'
  ) then
    alter publication supabase_realtime add table match_reports;
  end if;
end;
$$;
