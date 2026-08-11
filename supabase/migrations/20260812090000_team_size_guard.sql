-- Die Teamgroesse festnageln, sobald jemand angemeldet ist.
--
-- ⚠️ WARUM DAS EIN TRIGGER SEIN MUSS UND NICHT NUR EINE PRUEFUNG IN DER ACTION.
-- participants.type wird beim INSERT aus tournaments.team_size gestanzt und
-- danach NIE nachgerechnet (docs/HANDOVER.md §6). Wird team_size nachtraeglich
-- geaendert, behalten alle bestehenden Zeilen ihren alten Typ: bei 3 -> 1 bleiben
-- die Kinder 'player' und verschwinden aus dem Spielplan, bei 1 -> 3 bleiben sie
-- 'solo' und treten ploetzlich einzeln an. Beides ist live passiert — zehn
-- Kinder und ihr Team fielen aus dem Bracket, generateBracket erzeugte
-- kommentarlos einen Zweier-Baum, waehrend zwoelf eingecheckt waren.
--
-- updateTournament haelt diesen Fall seit ff71519 auf. Das ist der Weg der
-- Oberflaeche, nicht die Grenze der Daten: PostgREST liegt offen, jede Staff-
-- Sitzung darf tournaments per RLS schreiben, und ein spaeterer zweiter
-- Schreibweg (Skript, Import, neue Action) kaeme an der Action vorbei. Der
-- Riegel gehoert dorthin, wo alle Wege zusammenlaufen.
--
-- SECURITY INVOKER (Standard, absichtlich NICHT definer): die Funktion prueft
-- current_user, und in einer DEFINER-Funktion waere das immer der Eigentuemer.
-- Sie bleibt damit fuer PostgREST-Anfragen scharf ('authenticated'/'anon') und
-- laesst die Reparatur-Tuer offen — dasselbe Muster wie
-- guard_participant_protected_fields (20260811110000) und, in der Begruendung,
-- carry_over_participant (20260811141000): wer die Altdaten eines kaputten
-- Turniers geradezieht, arbeitet als postgres/service_role und muss team_size
-- zusammen mit den participants.type-Zeilen korrigieren duerfen.
--
-- ⚠️ KEHRSEITE VON INVOKER: das exists(...) auf participants laeuft unter der
-- RLS des AUFRUFERS, sieht also nur, was der auch selbst lesen darf. Heute
-- deckt sich das genau — wer tournaments aendern darf, ist is_organizer() seiner
-- Org und sieht ueber participants_select_owner_or_staff (20260629090000) alle
-- participants derselben Org. Wird diese SELECT-Policy fuer Staff je enger
-- gezogen, findet der Trigger keine Zeile mehr und geht OFFEN auf: die Sperre
-- faellt still weg, statt zu greifen.
--
-- ⚠️ KEINE WHEN-KLAUSEL. Die ganze Fallunterscheidung steht im Funktionskoerper.
-- In diesem Repo sind WHEN-Klauseln zweimal auf die Nase gefallen (HANDOVER §14,
-- Punkt 3: tg_op gibt es dort nicht, OLD darf dort nicht stehen, wenn derselbe
-- Trigger auch INSERT abdeckt) — und beim Proben wurde der Trigger versehentlich
-- OHNE sein WHEN angelegt, sodass die Probe etwas anderes zeigte als die
-- Anwendung. Ein Trigger ohne WHEN kann nur eines bedeuten.
create or replace function public.guard_tournament_team_size()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  -- Reparatur-Tuer. Bewusst vor jeder anderen Pruefung: wer hier durchkommt,
  -- korrigiert Altdaten und braucht genau diese Aenderung.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  -- Nur die Aenderung ist gesperrt, nicht das Feld: ein UPDATE, das team_size
  -- unveraendert mitschickt (jedes Formular tut das), muss durchgehen. Deshalb
  -- IS DISTINCT FROM und nicht "ist gesetzt". Status- und Archiv-Updates
  -- (generateBracket, LifecycleControls) laufen aus demselben Grund durch.
  --
  -- Der Wortlaut unten ist absichtlich nicht derselbe wie TEAM_SIZE_LOCKED in
  -- web/src/lib/tournament/lifecycle.ts: den Satz dort liest man am Formular,
  -- diesen hier bekommt nur zu sehen, wer die Oberflaeche umgangen hat.
  if new.team_size is distinct from old.team_size
     and exists (
       select 1 from public.participants p where p.tournament_id = new.id
     ) then
    raise exception 'Die Teamgröße kann nicht mehr geändert werden, sobald Anmeldungen existieren.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

comment on function public.guard_tournament_team_size() is
  'Sperrt tournaments.team_size, sobald das Turnier Anmeldungen hat: participants.type wird beim INSERT aus team_size abgeleitet und nie nachgerechnet, eine spaetere Aenderung macht bestehende Zeilen unsichtbar fuer den Spielplan. postgres/service_role duerfen weiterhin reparieren.';

drop trigger if exists trg_tournaments_team_size_guard on public.tournaments;

create trigger trg_tournaments_team_size_guard
  before update on public.tournaments
  for each row
  execute function public.guard_tournament_team_size();
