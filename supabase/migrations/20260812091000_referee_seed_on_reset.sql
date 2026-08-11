-- Schiedsrichter duerfen den seed loeschen — aber nur als Teil des Un-Check-ins.
--
-- Ausloeser: resetCheckIn setzt seit dem team_size-Vorfall `seed = null` mit
-- (ein Wettkaempfer ausserhalb des Spielplans darf keine Startnummer behalten —
-- genau die stehengebliebene Startnummer hat die Seed-Kollision im Rocket-
-- League-Turnier erzeugt). Der Staff-Zweig dieses Guards liess bisher aber NUR
-- checked_in_at durch; ein Schiedsrichter, der die Anwesenheit zuruecknimmt,
-- waere ab sofort an `insufficient_privilege` gescheitert — und 20260811110000
-- begruendet ausdruecklich, dass genau dieser Weg dem Schiedsrichter offen
-- stehen muss.
--
-- Die Tuer ist absichtlich schmal: `seed` darf sich nur aendern, wenn er dabei
-- NULL wird UND die Zeile im selben UPDATE nicht (mehr) eingecheckt ist. Ein
-- Schiedsrichter kann damit weiterhin keine Startnummer setzen, keine tauschen
-- und keine loeschen, solange jemand eingecheckt bleibt. Alles andere am
-- Funktionskoerper ist unveraendert gegenueber 20260811110000.
create or replace function public.guard_participant_protected_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
    if tg_op = 'INSERT' then
      return new;
    end if;

    if new.display_name  is distinct from old.display_name
       or new.gamertag      is distinct from old.gamertag
       or new.birthdate     is distinct from old.birthdate
       or new.user_id       is distinct from old.user_id
       or new.tournament_id is distinct from old.tournament_id
       -- Un-Check-in nimmt die Startnummer mit — nur dieser eine Fall.
       or (new.seed is distinct from old.seed
           and not (new.seed is null and new.checked_in_at is null))
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
$function$;
