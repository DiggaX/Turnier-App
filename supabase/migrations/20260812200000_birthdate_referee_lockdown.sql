-- §7.28: Geburtsdatum-Lockdown — schliesst die bewusste Luecke aus
-- 20260811110000:28-33 ("das Geburtsdatum bleibt fuer den Schiedsrichter auf
-- DB-Ebene lesbar").
--
-- Warum Spaltenrechte der eigentliche Schutz sind: sie gelten pro
-- Postgres-Rolle, und alle App-Rollen (admin, organizer, referee, angemeldete
-- Gaeste) sind dieselbe Rolle 'authenticated'. Solange authenticated die
-- Spalte lesen darf, kommt jeder mit Session per PostgREST direkt an
-- participants.birthdate — egal was die Oberflaeche ausblendet. RLS filtert
-- Zeilen, keine Spalten; Spalten koennen nur GRANTs.
--
-- Mechanik: ein blosses `revoke select (birthdate)` waere wirkungslos,
-- solange authenticated den tabellenweiten Supabase-Default-SELECT haelt —
-- ein Spalten-REVOKE nimmt nur Spalten-GRANTs zurueck, das Tabellenrecht
-- deckt weiter alle Spalten. Deshalb dasselbe Muster wie fuer anon in
-- 20260621093000:31-34: Tabellenrecht widerrufen, alle Spalten AUSSER
-- birthdate einzeln wiedergeben. Gewollte Nebenwirkung: kuenftige neue
-- Spalten sind fuer authenticated erst lesbar, wenn eine Migration sie
-- ausdruecklich freigibt.
--
-- Nur SELECT ist betroffen: INSERT und UPDATE bleiben unangetastet, Anmeldung
-- und Nachmeldung schreiben birthdate weiterhin. Owner-Grants
-- (postgres/service_role) bleiben unberuehrt. Die RETURNING-Formen im Repo
-- (`.insert(...).select("id, qr_token")` bzw. `.select("id")`) brauchen nur
-- SELECT auf den zurueckgegebenen Spalten — die stehen alle in der Liste.
revoke select on public.participants from authenticated;
grant select (
  id, tournament_id, user_id, type, display_name, gamertag, seed,
  checked_in_at, created_at, qr_token, team_id, is_captain, join_code
) on public.participants to authenticated;

-- ---------------------------------------------------------------------------
-- get_participant_birthdate: der einzige Leseweg zurueck zum Datum.
-- ---------------------------------------------------------------------------
-- Bewusst eine DEFINER-Funktion statt einer View: eine security_invoker-View
-- laeuft mit den Rechten des Aufrufers und duerfte die Spalte nach dem Revoke
-- selbst nicht mehr lesen (Invoker-Paradox). Die DEFINER-Funktion liest als
-- Owner, und die Empfaenger-Auswahl steht im Rumpf: nur Organizer, nur fuer
-- Teilnehmer aus Turnieren der eigenen Organisation. Muster wie get_my_team
-- (20260811093000).
--
-- Bewusst NULL statt RAISE: der Referee-Aufruf ist der Normalfall der
-- ausgeblendeten Zeile — die Seite rendert dann schlicht "—".
create or replace function public.get_participant_birthdate(p_participant_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select p.birthdate
  from participants p
  join tournaments t on t.id = p.tournament_id
  where p.id = p_participant_id
    and public.is_organizer()
    and t.org_id = public.current_org_id();
$$;

revoke all on function public.get_participant_birthdate(uuid) from public;
-- ⚠️ Das revoke from public reicht NICHT: Supabase-Default-Privileges granten
-- EXECUTE bei CREATE FUNCTION zusaetzlich DIREKT an anon/authenticated/
-- service_role (proacl zeigte anon=X/postgres). Der anon-Grant muss einzeln
-- weg — beim Beweisen gefunden, nicht theoretisch.
revoke execute on function public.get_participant_birthdate(uuid) from anon;
grant execute on function public.get_participant_birthdate(uuid) to authenticated;

comment on function public.get_participant_birthdate(uuid) is
  'Einziger Leseweg fuer participants.birthdate seit dem Spalten-Lockdown. NULL fuer alle ausser Organizern der eigenen Organisation.';
