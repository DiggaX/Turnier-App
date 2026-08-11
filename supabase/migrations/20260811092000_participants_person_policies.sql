-- Wer oeffentlich sichtbar ist, wer die Zuordnung aendern darf, wer im Spielplan
-- stehen darf, und wann ein Team als vollzaehlig gilt.
--
-- ===========================================================================
-- 0. Die Unterscheidung, an der alles haengt
-- ===========================================================================
--
-- Es gibt zwei Sorten Zeilen in participants, und sie werden ueber `type`
-- unterschieden — NICHT ueber team_id:
--
--   Wettkaempfer (tritt an, steht im Spielplan): type in ('solo','team')
--   Mensch       (ist eine Person):              type in ('solo','player')
--
-- Ein Einzelstarter ist beides zugleich. Ein 'player' ist immer nur ein Mensch.
--
-- Der erste Entwurf hat "Wettkaempfer" an `team_id is null` gehaengt. Das ist
-- falsch, und zwar an zwei Stellen gleichzeitig:
--
--   (a) Ein Spieler, der sich angemeldet hat und noch kein Team hat, traegt
--       team_id NULL. Er waere damit Wettkaempfer im Turnierbaum und fuer anon
--       sichtbar — obwohl er beides nicht ist. Genau diesen Fall ("noch kein
--       Team") soll die Anmeldung ausdruecklich anbieten.
--   (b) Wird eine Team-Zeile geloescht, setzt der Fremdschluessel team_id seiner
--       Mitglieder auf NULL. In derselben Sekunde waeren die Klarnamen dieser
--       Kinder oeffentlich abrufbar. In einer Rollback-Probe auf dieser
--       Datenbank nachgestellt: zwei Kinder, vorher unsichtbar, nach dem
--       Loeschen des Teams als anon namentlich lesbar.
--
-- Mit `type` als Unterscheidung gilt beides nicht mehr: ein 'player' bleibt ein
-- 'player', ob er ein Team hat oder nicht.
--
-- Damit ist `type` keine Beschriftung fuer die Oberflaeche, sondern die
-- tragende Spalte. Sie steht deshalb unten in der Liste der geschuetzten Felder.

-- ===========================================================================
-- 1. Das oeffentliche Board sieht nur noch Wettkaempfer
-- ===========================================================================
--
-- participants_select_public_board ist `for select to anon using (true)`,
-- begrenzt allein durch den Spalten-Grant aus 20260621093000 auf
-- (id, tournament_id, display_name). Das war vertretbar, solange in participants
-- nur Wettkaempfer standen und die Namen der Mitspieler in team_members lagen —
-- einer Tabelle, die anon nicht lesen darf.
--
-- Sobald jeder Mensch eine eigene Zeile ist, waeren die Klarnamen aller Spieler
-- jedes Turniers mit dem Anon-Key abrufbar. In dieser Datenbank sind das
-- ueberwiegend Kinder: von 20 Fotoerlaubnissen tragen 16 die Unterschrift eines
-- Erziehungsberechtigten. Diese Policy war schon einmal Gegenstand eines
-- Sicherheits-Hotfix (20260628090000_fix_participant_read_leak).
--
-- Nebenwirkung, die wir wollen: die eingebetteten Zaehler auf /t/[id] und
-- /o/[slug] laufen ueber den Anon-Client und zaehlen dadurch weiterhin
-- Wettkaempfer statt ploetzlich Wettkaempfer plus Spieler.
--
-- Wer seine Mitspieler sehen will, bekommt das NICHT ueber eine Zeilen-Policy:
-- authenticated hat SELECT auf allen Spalten, eine Policy koennte Geburtsdatum
-- und Beitritts-Code der Mitspieler nicht zurueckhalten. Dafuer gibt es
-- get_my_team mit fest verdrahteter Spaltenauswahl (20260811093000).

drop policy if exists "participants_select_public_board" on participants;
create policy "participants_select_public_board" on participants
  for select to anon
  using (type <> 'player');

comment on policy "participants_select_public_board" on participants is
  'Anon sieht nur Wettkaempfer fuers oeffentliche Board. Personen in Teams (type=player) bleiben unsichtbar, auch wenn sie gerade kein Team haben — es sind ueberwiegend Minderjaehrige.';

-- ===========================================================================
-- 2. Der Schutz-Trigger
-- ===========================================================================
--
-- 20260620090000_harden_participants_update.sql beschreibt genau diesen Trigger,
-- aber weder guard_participant_protected_fields() noch
-- trg_participants_guard_protected existieren auf dieser Datenbank — die Datei
-- wurde nie angewandt. Zugleich hat participants_update_owner_or_staff live kein
-- with_check, und authenticated haelt laut relacl `arwdDxtm` auf Tabellenebene,
-- also UPDATE auf allen Spalten inklusive der neu hinzukommenden. Ein Gast kann
-- seine eigene Zeile heute frei umschreiben. Ohne diesen Trigger waeren
-- create_team und join_team blosse Dekoration: man umgeht sie mit einem direkten
-- PATCH auf team_id und is_captain.
--
-- WICHTIG — die Falle, in die der erste Entwurf gelaufen ist:
-- Die Trigger-Funktion darf NICHT `security definer` sein. In einer
-- SECURITY-DEFINER-Funktion setzt Postgres current_user auf den Eigentuemer der
-- Funktion. Eine Abfrage `current_user = 'postgres'` waere darin also immer wahr
-- und der gesamte Feldschutz toter Code — live in begin/rollback bewiesen:
-- als Rolle authenticated lief ein direktes
-- `update participants set team_id=…, is_captain=true, seed=999` fehlerfrei durch.
--
-- Als SECURITY INVOKER stimmt es dagegen in beide Richtungen:
--   * PostgREST-Anfrage  -> current_user = 'authenticated' bzw. 'anon'  -> geschuetzt
--   * aus unseren DEFINER-RPCs -> current_user = 'postgres'             -> erlaubt
-- Eine INVOKER-Funktion, die innerhalb einer DEFINER-Funktion laeuft, erbt deren
-- Ausfuehrungsrolle. Genau das ist die Tuer, die unsere eigenen RPCs brauchen.
--
-- Preis dieser Bauweise: der Trigger darf die Ziel-Zeile nicht mehr selbst lesen,
-- weil ein Gast sie per RLS nicht sehen kann. Deshalb der kleine DEFINER-Helfer
-- direkt darunter, der genau eine Frage beantwortet und sonst nichts.

create or replace function public.participant_team_target_ok(p_team uuid, p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from participants p
    where p.id = p_team
      and p.tournament_id = p_tournament
      and p.type = 'team'
  );
$$;

revoke all on function public.participant_team_target_ok(uuid, uuid) from public, anon;
grant execute on function public.participant_team_target_ok(uuid, uuid) to authenticated;

create or replace function public.guard_participant_protected_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_privileged boolean := (current_user in ('postgres', 'service_role')) or public.is_staff();
begin
  -- Integritaet der Zuordnung: gilt fuer jeden, auch fuer Staff und fuer unsere
  -- eigenen RPCs. Ein Team darf nicht Mitglied eines Teams sein, und die
  -- Zuordnung darf keine Turniergrenze ueberspringen.
  if new.team_id is not null
     and not public.participant_team_target_ok(new.team_id, new.tournament_id) then
    raise exception 'team_id muss auf eine Team-Zeile desselben Turniers zeigen'
      using errcode = 'foreign_key_violation';
  end if;

  if v_privileged then
    return new;
  end if;

  -- --- ab hier: eine gewoehnliche Anfrage von aussen ---

  if tg_op = 'INSERT' then
    -- Die oeffentliche Anmeldung legt genau eine Zeile an: sich selbst. Alles,
    -- was ueber Beitritt, Rang oder Anwesenheit entscheidet, gehoert nicht in
    -- diesen Aufruf. Ohne diese Pruefung waere join_team umgehbar, indem man
    -- sich gleich MIT team_id und is_captain anmeldet — an Code,
    -- Vollzaehligkeit und Anmeldeschluss vorbei.
    if new.team_id is not null
       or new.join_code is not null
       or new.is_captain
       or new.seed is not null
       or new.checked_in_at is not null then
      raise exception 'Bei der Anmeldung duerfen team_id, join_code, is_captain, seed und checked_in_at nicht gesetzt werden'
        using errcode = 'check_violation';
    end if;

    -- Der Typ ergibt sich aus dem Turnier und ist nicht frei waehlbar. Sonst
    -- meldet man sich in einem 3on3 als type='solo' an und steht als
    -- Einzelkaempfer im Turnierbaum — oder als type='team' und ist eine
    -- Team-Zeile ohne Beitritts-Code, die niemand mehr aufloesen kann.
    -- tournaments ist oeffentlich lesbar (tournaments_select_public), der Blick
    -- dorthin funktioniert also auch fuer einen Gast.
    if new.type is distinct from (
         select case when t.team_size > 1 then 'player' else 'solo' end::participant_type
         from tournaments t where t.id = new.tournament_id
       ) then
      raise exception 'Der Teilnehmer-Typ ergibt sich aus der Teamgroesse des Turniers und kann nicht gesetzt werden'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if new.user_id       is distinct from old.user_id
     or new.tournament_id is distinct from old.tournament_id
     or new.seed         is distinct from old.seed
     or new.qr_token     is distinct from old.qr_token
     or new.type         is distinct from old.type
     or new.team_id      is distinct from old.team_id
     or new.is_captain   is distinct from old.is_captain
     or new.join_code    is distinct from old.join_code then
    raise exception 'Geschuetzte Teilnehmer-Felder duerfen nicht direkt geaendert werden (user_id, tournament_id, seed, qr_token, type, team_id, is_captain, join_code)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_participants_guard_protected on participants;
create trigger trg_participants_guard_protected
  before insert or update on participants
  for each row execute function public.guard_participant_protected_fields();

-- ===========================================================================
-- 3. Eine Person steht nie im Spielplan
-- ===========================================================================
--
-- Die Bracket-Quelle filtert heute allein auf checked_in_at
-- (bracket/actions.ts:222-228). Sobald eingecheckte Personen in participants
-- stehen, wandern sie ungefragt als eigene Wettkaempfer in den Turnierbaum — und
-- weil generateBracket vorher ALLE Matches des Turniers loescht, faellt das erst
-- auf, wenn das alte Bracket schon weg ist.
--
-- Der Anwendungscode bekommt dafuer seinen Filter (Phase 4). Diese Regel gehoert
-- trotzdem zusaetzlich in die Datenbank: sie verwandelt einen stillen, falschen
-- Turnierbaum in einen lauten Fehler. Genau die Sorte Fehler, die man am
-- Turniertag haben will statt der anderen.
create or replace function public.guard_match_competitors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from participants p
    where p.type = 'player'
      and p.id in (new.participant_a_id, new.participant_b_id, new.winner_id)
  ) then
    raise exception 'Eine Person kann nicht im Spielplan stehen — dort gehoert ihr Team hin'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_matches_guard_competitors on matches;
create trigger trg_matches_guard_competitors
  before insert or update of participant_a_id, participant_b_id, winner_id on matches
  for each row execute function public.guard_match_competitors();

-- ===========================================================================
-- 4. Wann ein Team spielbereit ist
-- ===========================================================================
--
-- Die Bracket-Quelle filtert auf checked_in_at. Diese Spalte traegt bei einer
-- Team-Zeile deshalb die Bedeutung "Team ist da und vollzaehlig" — dadurch muss
-- an der Bracket-Generierung nichts Neues erfunden werden, und der bestehende
-- manuelle Check-in der Orga (manualCheckIn -> check_in mit Methode 'manual')
-- funktioniert unveraendert als "Spielbereit"-Knopf.
--
-- Gesetzt wird automatisch, sobald so viele Mitglieder eingecheckt sind wie
-- tournaments.team_size verlangt — generisch ueber jede Teamgroesse, also auch
-- 2v2, 4v4, 5v5.
--
-- Die WHEN-Klausel ist nicht Kosmetik: ohne sie feuert der Trigger bei JEDER
-- Aenderung an einer Person-Zeile. Nimmt die Orga die Spielbereitschaft eines
-- vollzaehligen Teams zurueck und tippt danach irgendwo einen Namen um, saesse
-- die Freigabe stumm wieder da. So feuert er nur, wenn sich die Anwesenheit
-- dieser Person tatsaechlich geaendert hat.
--
-- Bewusst nur setzen, nie zuruecknehmen: die Spalte kann auch von Hand gesetzt
-- worden sein (Orga laesst ein Team zu zweit antreten). Zuruecknehmen geht ueber
-- resetCheckIn auf der Team-Zeile.
--
-- SECURITY DEFINER, weil der ausloesende Schreibvorgang ein Gast ist, der die
-- Team-Zeile per RLS nicht aendern darf. Hier ist das unbedenklich: die Funktion
-- trifft keine Rechteentscheidung, sie zaehlt nur.
create or replace function public.sync_team_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_size int;
  v_present   int;
begin
  if new.team_id is null or new.checked_in_at is null then
    return null;
  end if;

  select t.team_size into v_team_size
    from tournaments t where t.id = new.tournament_id;

  if v_team_size is null or v_team_size < 2 then
    return null;
  end if;

  select count(*) into v_present
    from participants p
    where p.team_id = new.team_id
      and p.checked_in_at is not null;

  if v_present >= v_team_size then
    update participants
      set checked_in_at = now()
      where id = new.team_id
        and checked_in_at is null;
  end if;

  return null;
end;
$$;

-- Zwei Trigger statt einem, und das ist keine Geschmacksfrage: in einer
-- WHEN-Klausel gibt es kein tg_op — das ist eine plpgsql-Variable und nur im
-- Funktionsrumpf sichtbar. Und OLD darf dort nicht vorkommen, wenn derselbe
-- Trigger auch INSERT abdeckt (Postgres lehnt das beim Anlegen ab, 42703).
-- Also der INSERT-Fall ohne OLD, der UPDATE-Fall mit.
--
-- Rekursion gibt es nicht: die Team-Zeile, die der Trigger schreibt, hat selbst
-- team_id is null und faellt in beiden WHEN-Klauseln sofort heraus.
drop trigger if exists trg_participants_team_ready on participants;

create trigger trg_participants_team_ready_ins
  after insert on participants
  for each row
  when (new.team_id is not null and new.checked_in_at is not null)
  execute function public.sync_team_ready();

-- Nur wenn sich die Anwesenheit dieser Person wirklich geaendert hat. Sonst
-- feuert der Trigger bei jeder Namenskorrektur mit, und eine von der Orga
-- zurueckgenommene Team-Freigabe saesse danach stumm wieder da.
drop trigger if exists trg_participants_team_ready_upd on participants;
create trigger trg_participants_team_ready_upd
  after update on participants
  for each row
  when (
    new.team_id is not null
    and new.checked_in_at is not null
    and old.checked_in_at is distinct from new.checked_in_at
  )
  execute function public.sync_team_ready();
