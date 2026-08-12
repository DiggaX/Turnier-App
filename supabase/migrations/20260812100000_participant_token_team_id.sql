-- Der Link-Modus von /t/[id]/me zeigt einem Teamspieler eine LEERE Partienliste,
-- sobald alle seine Partien gespielt sind (HANDOVER §7.32). Grund ist diese
-- Funktion: sie liefert kein team_id. Im Spielplan steht bei Teamturnieren aber
-- die Team-Zeile — der "Wettkaempfer" ist coalesce(team_id, id), siehe
-- 20260811095000_report_match_competitor.sql. Ohne team_id kennt die Seite nur
-- die Personen-Zeile und hat sich den Wettkaempfer bisher aus dem OFFENEN Match
-- geholt (get_open_match_by_qr_token). Ist nichts mehr offen, gibt es nichts
-- abzuleiten, und die Filterung findet keine einzige Partie. Einzelstarter waren
-- nie betroffen: bei ihnen IST die Personen-Zeile der Wettkaempfer.
--
-- Die Abwaegung aus 20260710090000_participant_recovery_link.sql bleibt
-- unveraendert gueltig: der qr_token ist ohnehin der Ausweis des Teilnehmers
-- (Staff scannt den rohen Token beim Check-in, siehe 20260618090000_checkin.sql),
-- wer ihn hat, darf diese Zeile lesen. team_id ist die id einer participants-
-- Zeile (der Team-Zeile) und damit selbst keine PII — deren display_name steht
-- ohnehin oeffentlich auf dem Live-Board. Die Zusage der Funktion gilt weiter:
-- nur die eigenen unkritischen Felder, kein Geburtsdatum, keine user_id, kein
-- Seed.
--
-- drop statt create or replace: CREATE OR REPLACE FUNCTION darf den
-- Rueckgabetyp nicht aendern ("cannot change return type of existing function"),
-- und eine zusaetzliche Spalte in RETURNS TABLE ist genau das. Die Rechte
-- haengen an der alten Funktion und fallen mit ihr weg — deshalb steht der grant
-- unten noch einmal.
drop function if exists public.get_participant_by_qr_token(uuid);

create function public.get_participant_by_qr_token(p_qr_token uuid)
returns table (
  id uuid,
  tournament_id uuid,
  display_name text,
  qr_token uuid,
  checked_in_at timestamptz,
  has_consent boolean,
  team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.tournament_id,
    p.display_name,
    p.qr_token,
    p.checked_in_at,
    exists (select 1 from consents c where c.participant_id = p.id) as has_consent,
    p.team_id
  from participants p
  where p.qr_token = p_qr_token;
$$;

grant execute on function public.get_participant_by_qr_token(uuid) to anon, authenticated;
