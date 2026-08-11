-- Der Schiedsrichter bekommt endlich die Rechte, die sein Name verspricht.
--
-- Bisher ist die Rolle 'referee' ein Etikett ohne Wirkung: is_staff() umfasst
-- admin, organizer UND referee, und JEDE Policy auf participants, matches,
-- tournaments, consents und check_ins haengt an is_staff(). Ein Helfer, dem man
-- fuer einen Nachmittag den Ergebnis-Tresen anvertraut, kann damit Turniere
-- loeschen, Teilnehmer loeschen, das Bracket neu erzeugen und alle Geburtsdaten
-- lesen. Der einzige Unterschied zum Organizer im ganzen Repo ist der
-- Spiele-Katalog (web/src/lib/auth/staff.ts:63).
--
-- Was der Schiedsrichter kuenftig darf:
--   Check-in und Anwesenheit zuruecksetzen, Teams spielbereit melden,
--   Live-Score zaehlen, Ergebnisse freigeben, Nachmeldungen am Tresen anlegen.
-- Was er nicht mehr darf:
--   loeschen (Teilnehmer, Turniere), das Bracket erzeugen, Turnier-
--   Einstellungen aendern, Teilnehmerdaten umschreiben.
--
-- Freigeben bleibt moeglich, ohne ihm Schreibrecht auf matches zu geben:
-- confirm_match ist SECURITY DEFINER und prueft is_staff() in sich selbst, laeuft
-- also an der Tabellen-Policy vorbei. Dasselbe gilt fuer check_in und die
-- Live-Score-Funktionen. Genau deshalb kann matches_write_staff auf Organizer
-- verengt werden, ohne die Arbeit am Tresen anzufassen.
--
-- Risiko beim Anwenden: keines fuer den Bestand. In dieser Organisation gibt es
-- heute drei Admins und einen Organizer und keinen einzigen referee — die
-- Aenderung haertet eine Rolle, die noch niemand traegt.
--
-- Nicht enthalten, und das ist eine bewusste Luecke: das Geburtsdatum bleibt
-- fuer den Schiedsrichter auf DB-Ebene lesbar. Spalten-Rechte gelten pro
-- Postgres-Rolle, und alle drei App-Rollen sind dieselbe Rolle 'authenticated' —
-- eine echte Trennung braeuchte eine eigene View oder eine DEFINER-Funktion mit
-- fester Spaltenauswahl. Die Oberflaeche blendet es aus; das ist die halbe
-- Miete und gehoert als eigene Aufgabe nachgezogen.

create or replace function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('admin', 'organizer')
  );
$$;

revoke all on function public.is_organizer() from public;
grant execute on function public.is_organizer() to anon, authenticated;

comment on function public.is_organizer() is
  'Wie is_staff(), aber ohne referee. Fuer alles, was loescht, das Bracket erzeugt oder Turnier-Einstellungen aendert.';

-- --- Loeschen: nur Organizer ----------------------------------------------
drop policy if exists "participants_delete_staff" on participants;
create policy "participants_delete_staff" on participants
  for delete
  using (
    public.is_organizer()
    and exists (
      select 1 from tournaments t
      where t.id = participants.tournament_id
        and t.org_id = public.current_org_id()
    )
  );

-- --- Turnier-Einstellungen: nur Organizer ----------------------------------
-- Lesen bleibt oeffentlich (tournaments_select_public), der Schiedsrichter
-- sieht das Turnier also weiterhin.
drop policy if exists "tournaments_write_staff" on tournaments;
create policy "tournaments_write_staff" on tournaments
  for all
  using (public.is_organizer() and org_id = public.current_org_id())
  with check (public.is_organizer() and org_id = public.current_org_id());

-- --- Spielplan schreiben: nur Organizer ------------------------------------
-- Das ist die Bracket-Erzeugung. Ergebnisse gibt der Schiedsrichter ueber
-- confirm_match frei, das als SECURITY DEFINER an dieser Policy vorbeilaeuft.
-- Lesen bleibt oeffentlich (matches_select_public).
drop policy if exists "matches_write_staff" on matches;
create policy "matches_write_staff" on matches
  for all
  using (
    public.is_organizer()
    and exists (
      select 1 from tournaments t
      where t.id = matches.tournament_id and t.org_id = public.current_org_id()
    )
  )
  with check (
    public.is_organizer()
    and exists (
      select 1 from tournaments t
      where t.id = matches.tournament_id and t.org_id = public.current_org_id()
    )
  );

-- --- Teilnehmerdaten: der Schiedsrichter darf nur die Anwesenheit ----------
--
-- participants_update_owner_or_staff bleibt bei is_staff(), sonst koennte der
-- Schiedsrichter keine Anwesenheit mehr zuruecksetzen — resetCheckIn schreibt
-- direkt auf die Tabelle (participants/actions.ts:32), nicht ueber eine RPC.
-- Die Feinsteuerung uebernimmt der Trigger, der ohnehin bei jedem Update laeuft.
--
-- Aufbau der Fallunterscheidung, von oben nach unten:
--   1. Integritaet der Zuordnung  -> gilt fuer alle, ausnahmslos
--   2. postgres/service_role/Organizer -> darf alles
--   3. Schiedsrichter             -> beim INSERT alles (Nachmeldung am Tresen),
--                                    beim UPDATE nur checked_in_at
--   4. alle uebrigen (Gaeste)     -> wie bisher
create or replace function public.guard_participant_protected_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.team_id is not null
     and not public.participant_team_target_ok(new.team_id, new.tournament_id) then
    raise exception 'team_id muss auf eine Team-Zeile desselben Turniers zeigen'
      using errcode = 'foreign_key_violation';
  end if;

  if current_user in ('postgres', 'service_role') or public.is_organizer() then
    return new;
  end if;

  if public.is_staff() then
    -- Schiedsrichter. Die Nachmeldung am Tresen legt eine vollstaendige Zeile an
    -- (auch type='team' fuer ein Walk-in-Team), das bleibt erlaubt.
    if tg_op = 'INSERT' then
      return new;
    end if;

    if new.display_name  is distinct from old.display_name
       or new.gamertag      is distinct from old.gamertag
       or new.birthdate     is distinct from old.birthdate
       or new.user_id       is distinct from old.user_id
       or new.tournament_id is distinct from old.tournament_id
       or new.seed          is distinct from old.seed
       or new.qr_token      is distinct from old.qr_token
       or new.type          is distinct from old.type
       or new.team_id       is distinct from old.team_id
       or new.is_captain    is distinct from old.is_captain
       or new.join_code     is distinct from old.join_code then
      raise exception 'Als Schiedsrichter darfst du nur die Anwesenheit aendern, nicht die Teilnehmerdaten'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.team_id is not null
       or new.join_code is not null
       or new.is_captain
       or new.seed is not null
       or new.checked_in_at is not null then
      raise exception 'Bei der Anmeldung duerfen team_id, join_code, is_captain, seed und checked_in_at nicht gesetzt werden'
        using errcode = 'check_violation';
    end if;

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
