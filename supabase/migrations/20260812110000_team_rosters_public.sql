-- Die Aufstellung einer Mannschaft oeffentlich zeigen — OHNE die Anon-Policy
-- anzufassen.
--
-- Bisher steht oeffentlich nur der Teamname. Wer in dem Team spielt, sieht
-- niemand: participants_select_public_board (20260811092000) laesst fuer anon
-- nur `type <> 'player'` durch, und genau so bleibt es auch. Diese Policy ist
-- der Riegel, hinter dem Geburtsdatum, user_id und qr_token der Kinder liegen —
-- sie wirkt zusammen mit dem Spalten-GRANT auf participants(id, tournament_id,
-- display_name) aus 20260621093000.
--
-- WARUM eine DEFINER-Funktion statt einer breiteren Policy: eine Policy
-- entscheidet ueber ZEILEN, nicht ueber SPALTEN. Wuerde man `type = 'player'`
-- fuer anon oeffnen, haengt der Schutz der Personen-Zeilen ab diesem Moment
-- allein am Spalten-GRANT — an einer Liste also, die eine spaetere Migration
-- unbemerkt erweitern kann (`grant select on participants to anon` genuegt).
-- Diese Funktion dagegen nennt ihre drei Spalten fest im Rueckgabetyp und kann
-- gar nichts anderes liefern, egal was spaeter an der Tabelle passiert.
--
-- Bewusste Entscheidung des Veranstalters (Rene, 2026-08-12, nach ausdruecklicher
-- PII-Abwaegung, dokumentiert in docs/HANDOVER.md): Anzeigename und
-- Kapitaensrolle stehen am Turniertag ohnehin auf dem Beamer und werden
-- ausgerufen — sie oeffentlich neben dem Teamnamen zu zeigen ist gewollt.
-- Alles andere bleibt drinnen.
--
-- Spieler OHNE Team tauchen hier NIE auf (`team_id is not null`). Sie sind in
-- keiner Mannschaft, gehoeren also in keine Aufstellung — und sie sind genau der
-- Fall, den die Public-Board-Policy zum Schutz Minderjaehriger zurueckhaelt
-- (siehe 20260811092000, Abschnitt 0b: beim Loeschen einer Team-Zeile faellt
-- team_id der Mitglieder auf NULL). Waeren sie hier drin, haette dieses Loeschen
-- die Kinder wieder oeffentlich gemacht — nur diesmal an der Policy vorbei.
--
-- Und darum steht der team_size-Riegel IN der Funktion, nicht beim Aufrufer:
-- die Funktion nimmt jede beliebige Turnier-UUID entgegen, jeder darf sie
-- aufrufen. Bei einem Einzelturnier (team_size = 1) haben Spieler normalerweise
-- gar keine team_id — aber „normalerweise" ist kein Riegel: das Rocket-League-
-- Turnier aus dem team_size-Vorfall hat verwaiste type='player'-Zeilen MIT
-- team_id, und das sind exakt die Zeilen, die participants_select_public_board
-- fuer anon zurueckhaelt. Haengt der Schutz nur am `isTeam`-Check der Seite,
-- reicht ein direkter RPC-Aufruf mit dieser UUID, um ihn zu umgehen — genau das
-- Argument, mit dem oben die DEFINER-Funktion gegen die breitere Policy
-- begruendet wird, gilt hier gegen sich selbst. Eine Funktion muss ihren
-- eigenen Vertrag halten und darf ihn nicht an Aufrufer delegieren, also:
-- join auf tournaments, und ohne `team_size > 1` kommt nichts zurueck.
--
-- Rueckgabetyp unveraendert — `create or replace` bleibt gueltig, diese
-- Migration darf gefahrlos erneut eingespielt werden.
create or replace function public.get_team_rosters(p_tournament_id uuid)
returns table (
  team_id uuid,
  display_name text,
  is_captain boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id, p.display_name, p.is_captain
  from participants p
  join tournaments t on t.id = p.tournament_id
  where p.tournament_id = p_tournament_id
    and t.team_size > 1
    and p.type = 'player'
    and p.team_id is not null
  order by p.team_id, p.is_captain desc, p.created_at;
$$;

comment on function public.get_team_rosters(uuid) is
  'Oeffentliche Mannschaftsaufstellung: genau (team_id, display_name, is_captain) fuer type=player mit Team, und nur bei Turnieren mit team_size > 1 — bei Einzelturnieren liefert sie nichts. Bewusst schmal statt breiterer anon-Policy — siehe Migration 20260812110000.';

grant execute on function public.get_team_rosters(uuid) to anon, authenticated;
