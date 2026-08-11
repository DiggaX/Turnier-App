-- Eine wiederkehrende Person ins laufende Turnier uebernehmen.
--
-- Am Einlass steht ein Kind mit dem QR-Code vom letzten Turnier. Statt es neu
-- anzumelden, legt diese Funktion eine Zeile im heutigen Turnier an und kopiert
-- Name, Gamertag und Geburtsdatum. Eingecheckt wird danach ueber check_in() —
-- bewusst getrennt, siehe unten.
--
-- ⚠️ WARUM DER TOKEN UND NICHT DIE TEILNEHMER-ID DER PARAMETER IST.
-- Diese Funktion schreibt eine FREMDE auth.users-Id auf eine neue Anmeldung.
-- Genau das verbietet participants_insert_staff mit user_id IS NULL, und diese
-- Policy bleibt unangetastet (docs/HANDOVER.md §5) — sie ist die Grenze, ohne
-- die Staff sich Anmeldungen auf beliebige Konten schreiben koennte.
-- Ein Id-Parameter waere genau dieses Loch: Staff darf jede Teilnehmer-Id der
-- eigenen Organisation lesen, koennte also fuer jeden je Angemeldeten eine neue
-- Anmeldung erzeugen, ohne dass die Person anwesend ist. Der qr_token ist das,
-- was jemand physisch dabeihat. Er ist der Schluessel zu dieser schmalen Tuer,
-- und deshalb ist er der Parameter.
--
-- ⚠️ TYPE WIRD HIER GESETZT, WEIL DER TRIGGER ES NICHT TUT.
-- guard_participant_protected_fields() ist absichtlich nicht SECURITY DEFINER
-- und prueft current_user. Innerhalb DIESER Funktion ist current_user gleich
-- postgres, der Waechter kehrt auf seinem ersten Zweig zurueck und erzwingt
-- nichts. Der Ausdruck unten ist deshalb woertlich derselbe wie im Trigger.
--
-- Nicht kopiert, jedes einzeln entschieden: seed und checked_in_at (das neue
-- Turnier faengt bei null an), team_id / is_captain / join_code (Zugehoerigkeit
-- gilt pro Turnier), qr_token (kommt per Default neu — er ist unique, kopieren
-- ginge gar nicht), und die Fotoerlaubnis. Letztere ist der wichtigste Punkt:
-- eine Einwilligung wurde fuer EIN Turnier erteilt, mit dem Wortlaut und der
-- Unterschrift von damals. Wer sie mitkopiert, laesst den Nachweis-Ausdruck
-- spaeter eine Zustimmung behaupten, die es fuer dieses Turnier nie gab.
create or replace function public.carry_over_participant(
  p_qr_token      uuid,
  p_tournament_id uuid
)
returns table (participant_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target record;
  v_src    record;
  v_allow  boolean;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  select t.id, t.org_id, t.team_size, t.status, t.archived_at
    into v_target
  from tournaments t
  where t.id = p_tournament_id;

  if not found then
    raise exception 'Turnier wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  -- is_staff() schliesst referee ein, und das ist Absicht: am Scanner steht der
  -- Schiedsrichter. Ihn zum Turnierleiter zu schicken hiesse, den Einlass
  -- anzuhalten. Die Aktion ist eng begrenzt — drei Felder plus eine user_id, die
  -- von einem gescannten Code stammt, in genau eine neue Zeile.
  if not (public.is_staff() and v_target.org_id = public.current_org_id()) then
    raise exception 'Diese Aktion ist nicht erlaubt.' using errcode = '42501';
  end if;

  if v_target.archived_at is not null then
    raise exception 'Dieses Turnier ist archiviert.' using errcode = '22023';
  end if;

  -- Absichtlich weiter als assert_team_phase, das nur 'registration' zulaesst:
  -- jenes bewacht Selbstbedienung durch Gaeste, wo der Anmeldeschluss das
  -- Produkt ist. Hier steht Staff an der Tuer, wo der Anmeldeschluss das
  -- PROBLEM ist — dasselbe, fuer das die Nachmeldung gebaut wurde. Das ist kein
  -- Versehen und keine Inkonsistenz zum Reparieren.
  if v_target.status not in ('registration', 'running') then
    raise exception 'In diesem Turnier ist der Einlass nicht geoeffnet.'
      using errcode = '22023';
  end if;

  select o.allow_carry_over into v_allow
  from organizations o where o.id = v_target.org_id;

  if not coalesce(v_allow, false) then
    raise exception 'Die Uebernahme ist fuer diese Organisation nicht freigeschaltet.'
      using errcode = '22023';
  end if;

  select p.id, p.tournament_id, p.user_id, p.type,
         p.display_name, p.gamertag, p.birthdate,
         src_t.org_id as src_org
    into v_src
  from participants p
  join tournaments src_t on src_t.id = p.tournament_id
  where p.qr_token = p_qr_token;

  -- Unbekannter Code und Code aus einer FREMDEN Organisation geben bewusst
  -- dieselbe Meldung. Unterschiedliche Texte machten den Scanner zum Orakel:
  -- man haelt einen fremden Code an die eigene Tuer und erfaehrt, ob die Person
  -- anderswo im System existiert.
  if not found or v_src.src_org is distinct from v_target.org_id then
    raise exception 'Dieser Code gehoert zu keinem Teilnehmer.' using errcode = 'P0002';
  end if;

  -- Reihenfolge zaehlt: eine Team-Zeile hat immer user_id IS NULL und bekaeme
  -- sonst die Konto-Meldung, die hier in die Irre fuehrt.
  if v_src.type = 'team' then
    raise exception 'Ein Team kann nicht uebernommen werden, nur eine Person.'
      using errcode = '22023';
  end if;

  -- Die echte Grenze der Funktion. Eine frueher von Hand nachgemeldete Person
  -- hat kein Konto, und der qr_token ist unique — es gibt also nichts, woran
  -- ein zweiter Scan sie wiedererkennen koennte. Ohne das entstuende bei jedem
  -- weiteren Scan eine neue Zeile.
  if v_src.user_id is null then
    raise exception 'Diese Anmeldung hat kein Konto und kann nicht uebernommen werden. Bitte als Nachmeldung eintragen.'
      using errcode = '22023';
  end if;

  -- Heute unerreichbar, weil participants_birthdate_required_for_accounts das
  -- schon garantiert. Bleibt stehen: faellt der Constraint je, ist das hier ein
  -- Satz am Tresen statt eines rohen 23514.
  if v_src.birthdate is null then
    raise exception 'Fuer diese Anmeldung fehlt das Geburtsdatum.' using errcode = '22023';
  end if;

  -- Ein Statement, kein Lesen-dann-Schreiben: deckt "vor zehn Minuten schon
  -- uebernommen" und "zwei Tueren im selben Moment" mit derselben Zeile ab.
  insert into participants
    (tournament_id, user_id, type, display_name, gamertag, birthdate)
  values
    (p_tournament_id,
     v_src.user_id,
     (case when v_target.team_size > 1 then 'player' else 'solo' end)::participant_type,
     v_src.display_name, v_src.gamertag, v_src.birthdate)
  on conflict (tournament_id, user_id) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select p.id into v_new_id
    from participants p
    where p.tournament_id = p_tournament_id and p.user_id = v_src.user_id;
    return query select v_new_id, false;
    -- ⚠️ RETURN QUERY beendet die Funktion NICHT, es haengt Zeilen an das
    -- Ergebnis an. Ohne dieses RETURN faellt der zweite Aufruf durch und liefert
    -- zusaetzlich (id, true) — der Aufrufer laese daraus "gerade neu angelegt",
    -- obwohl nichts entstanden ist. Beim Beweis aufgefallen, nicht beim Lesen.
    return;
  end if;

  return query select v_new_id, true;
end;
$function$;

-- Ohne das explizite Revoke traegt eine neue Funktion PUBLIC EXECUTE und ist
-- ueber /rest/v1/rpc/ unauthentifiziert erreichbar.
revoke all on function public.carry_over_participant(uuid, uuid) from public, anon;
grant execute on function public.carry_over_participant(uuid, uuid) to authenticated;

comment on function public.carry_over_participant(uuid, uuid) is
  'Legt fuer den Inhaber eines qr_token aus einem frueheren Turnier derselben Organisation eine Anmeldung im Zielturnier an und kopiert Name, Gamertag und Geburtsdatum — nicht die Fotoerlaubnis. Idempotent. Verlangt is_staff() der Ziel-Organisation und organizations.allow_carry_over.';
