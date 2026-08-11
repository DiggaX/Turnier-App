-- Der Umzug: aus jeder Zeile in team_members wird ein Mensch in participants.
--
-- team_members wird hier NICHT geloescht und NICHT umbenannt. Das ist Absicht.
-- Diese Datenbank hat kein Staging, keine CI und keinen lokalen Stack; der
-- Migrations-Ledger kennt 20 der 35 Dateien im Ordner, ein `supabase db reset`
-- kann Produktion also nachweislich nicht nachbauen. Solange die Tabelle steht,
-- ist dieser Schritt ohne Datenverlust umkehrbar — die neuen Zeilen tragen
-- team_id und lassen sich gezielt wieder entfernen:
--
--   delete from participants where type = 'player' and user_id is null;
--
-- Geloescht wird team_members in einer eigenen, spaeteren Migration — erst
-- nachdem die neue Anmeldung und der Teams-Screen eine Turnierrunde lang
-- gelaufen sind.
--
-- ZEITPUNKT: Diese Datei gehoert als LETZTE der sechs angewandt, unmittelbar
-- bevor der neue Anwendungscode ausgeliefert wird. Bis dahin schreibt
-- register-client.tsx bei jeder Team-Anmeldung weiter in team_members; ein
-- frueher Umzug wuerde diese Nachzuegler verpassen. Die Datei ist genau deshalb
-- wiederholbar gebaut: nach dem Ausliefern noch einmal laufen lassen kostet
-- nichts und holt alles nach, was in der Luecke entstanden ist.
--
-- Wiederholbarkeit ueber das TEAM, nicht ueber den Namen: hat ein Team schon
-- Personen, wird es uebersprungen. Ein Vergleich ueber display_name waere falsch
-- — zwei Mitspieler duerfen denselben Vornamen tragen, und beim zweiten Lauf
-- wuerde einer von beiden verschluckt.
--
-- Was die Zeilen mitbringen und was nicht:
--   name, gamertag, is_captain  -> uebernommen
--   user_id                     -> NULL. Diese Menschen hatten nie einen eigenen
--                                  Zugang; sie standen nur im Formular des
--                                  Captains. Sie koennen sich spaeter selbst
--                                  anmelden und per Code beitreten.
--   birthdate                   -> NULL. team_members hatte kein Geburtsdatum.
--                                  Genau das war der Anlass fuer den Umbau: fuer
--                                  diese Personen existiert bis heute keine
--                                  Fotoerlaubnis. Der CHECK
--                                  (user_id is null or birthdate is not null)
--                                  laesst NULL zu, weil kein Auth-User dranhaengt.
--   checked_in_at               -> NULL. Anwesenheit war nie pro Person erfasst.
--
-- Der Umzug prueft die Teamgroesse bewusst NICHT. Das einzige bestehende Team
-- ("Rene_Test" im Turnier "test") hat vier Mitglieder bei team_size 3 — eine
-- Ueberbelegung, die das alte Formular nie verhindert hat. Sie hier stillschweigend
-- zu beschneiden hiesse, Daten zu verwerfen; sie abzulehnen hiesse, die Migration
-- an Testdaten scheitern zu lassen. Stattdessen wandert sie mit und faellt im
-- Restspieler-Panel (Phase 4) als unvollstaendig bzw. ueberbesetzt auf, wo ein
-- Mensch entscheidet.

insert into participants (
  tournament_id, user_id, type, display_name, gamertag, birthdate, team_id, is_captain
)
select
  team.tournament_id,
  null,
  'player'::participant_type,
  m.name,
  m.gamertag,
  null,
  team.id,
  m.is_captain
from team_members m
join participants team on team.id = m.participant_id
where team.type = 'team'
  and not exists (
    select 1 from participants existing where existing.team_id = team.id
  );

comment on table team_members is
  'ABGELOEST durch participants (type=player, team_id). Bleibt als Rueckweg stehen, bis die neue Anmeldung eine Turnierrunde gelaufen ist; wird dann in einer eigenen Migration entfernt.';
