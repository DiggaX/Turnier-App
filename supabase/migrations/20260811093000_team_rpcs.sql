-- Team gruenden, per Code beitreten, verwalten, austreten — und sehen, wo man
-- gerade steht.
--
-- Warum Funktionen und nicht Policies: die oeffentliche Anmeldung hat keine
-- Server-Action, sie schreibt mit dem Anon-Key direkt unter RLS
-- (register-client.tsx). Ein Gast kann deshalb strukturell keine Team-Zeile
-- anlegen — participants_insert_self verlangt `user_id = auth.uid()`, und bei
-- user_id IS NULL wertet das zu NULL aus, nicht zu TRUE. Die Policy dafuer zu
-- oeffnen waere der falsche Weg: authenticated haelt laut relacl `arwdDxtm` auf
-- participants, also INSERT/UPDATE auf ALLEN Spalten; eine grosszuegigere Policy
-- gaebe damit auch birthdate, qr_token, user_id und seed frei. Deshalb
-- SECURITY DEFINER mit fest verdrahtetem Rumpf, und der Trigger aus
-- 20260811092000 als Riegel gegen den direkten Weg daran vorbei.
--
-- Jede Funktion prueft auth.uid() selbst und arbeitet auf der Zeile des
-- Aufrufers. Der Turnier-Parameter ist noetig, weil ein Gast in mehreren
-- Turnieren angemeldet sein kann — dieselbe anonyme Sitzung wird wiederverwendet
-- (web/src/lib/supabase/guest-session.ts).
--
-- Alle Schreibfunktionen laufen nur waehrend status = 'registration'.
-- Umsortieren am Turniertag ist Sache der Orga; die hat den Teams-Screen und
-- schreibt als Staff direkt.
--
-- Rechte: erst `revoke all ... from public, anon`, dann gezielt an
-- authenticated. Ohne das explizite revoke traegt jede neue Funktion
-- PUBLIC EXECUTE (=X/postgres) und ist ueber /rest/v1/rpc/... ohne Anmeldung
-- erreichbar — genau das meldet der Supabase-Linter fuer die aelteren Funktionen
-- dieses Projekts. Gaeste sind anonyme Auth-User und tragen die Rolle
-- 'authenticated'; anon wird hier nirgends gebraucht.

-- ---------------------------------------------------------------------------
-- Gemeinsamer Einstieg: die eigene Zeile holen und das Turnier pruefen.
-- ---------------------------------------------------------------------------
create or replace function public.assert_team_phase(p_tournament_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team_size int;
  v_status    tournament_status;
begin
  select t.team_size, t.status into v_team_size, v_status
    from tournaments t where t.id = p_tournament_id;

  if v_team_size is null then
    raise exception 'Turnier wurde nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_team_size < 2 then
    raise exception 'Dieses Turnier wird einzeln gespielt.' using errcode = '22023';
  end if;
  if v_status <> 'registration' then
    raise exception 'Die Anmeldung fuer dieses Turnier ist geschlossen.' using errcode = '22023';
  end if;

  return v_team_size;
end;
$$;

revoke all on function public.assert_team_phase(uuid) from public, anon;
grant execute on function public.assert_team_phase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_team: legt die Team-Zeile an und macht den Aufrufer zum Captain.
-- ---------------------------------------------------------------------------
create or replace function public.create_team(p_tournament_id uuid, p_name text)
returns table (team_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       participants%rowtype;
  v_name     text := nullif(btrim(p_name), '');
  v_code     text;
  v_new_id   uuid;
  v_try      int := 0;
  -- Ohne I, O, 0 und 1: der Code wird abgelesen und weitergesagt. Sechs Zeichen
  -- aus 32 sind rund 1,07 Milliarden Moeglichkeiten. Fuenf waeren 33 Millionen
  -- gewesen — bei einem Treffer bekaeme der Ratende ueber get_my_team die
  -- Vornamen der Kinder dieses Teams zu sehen, deshalb das zusaetzliche Zeichen.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'Bitte einen Teamnamen angeben.' using errcode = '22023';
  end if;

  perform public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null then
    raise exception 'Du bist fuer dieses Turnier nicht angemeldet.' using errcode = 'P0002';
  end if;
  -- Ueber type, nicht ueber join_code: eine aus team_members uebernommene
  -- Alt-Zeile ist type='team' OHNE Code und wuerde sonst hier durchrutschen und
  -- zum Mitglied ihres eigenen neuen Teams degradiert.
  if v_me.type = 'team' then
    raise exception 'Diese Anmeldung ist bereits ein Team.' using errcode = '22023';
  end if;
  if v_me.team_id is not null then
    raise exception 'Du bist bereits in einem Team. Tritt erst aus.' using errcode = '23505';
  end if;

  -- Der Code ist pro Turnier eindeutig (partieller Unique-Index ueber
  -- upper(join_code)). Statt vorher zu pruefen und zu hoffen, wird eingefuegt und
  -- die Kollision abgefangen — die einzige Variante, die auch unter zwei
  -- gleichzeitigen Anmeldungen stimmt.
  loop
    v_try := v_try + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into participants (tournament_id, user_id, type, display_name, birthdate, join_code)
      values (p_tournament_id, null, 'team', v_name, null, v_code)
      returning id into v_new_id;
      exit;
    exception when unique_violation then
      if v_try >= 20 then raise; end if;
    end;
  end loop;

  update participants
     set team_id = v_new_id, is_captain = true
   where id = v_me.id;

  return query select v_new_id, v_code;
end;
$$;

revoke all on function public.create_team(uuid, text) from public, anon;
grant execute on function public.create_team(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- join_team: Beitritt ueber den Code des Captains.
-- ---------------------------------------------------------------------------
create or replace function public.join_team(p_tournament_id uuid, p_code text)
returns table (team_id uuid, team_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        participants%rowtype;
  v_team      participants%rowtype;
  v_team_size int;
  v_taken     int;
  v_code      text := upper(nullif(btrim(p_code), ''));
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  if v_code is null then
    raise exception 'Bitte den Team-Code eingeben.' using errcode = '22023';
  end if;

  v_team_size := public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null then
    raise exception 'Du bist fuer dieses Turnier nicht angemeldet.' using errcode = 'P0002';
  end if;
  if v_me.type = 'team' then
    raise exception 'Diese Anmeldung ist ein Team und kann keinem Team beitreten.' using errcode = '22023';
  end if;
  if v_me.team_id is not null then
    raise exception 'Du bist bereits in einem Team. Tritt erst aus.' using errcode = '23505';
  end if;

  -- for update sperrt die Team-Zeile bis zum Ende der Transaktion. Ohne diese
  -- Sperre ist die Zaehlung darunter ein Pruefen-dann-Handeln: zwei Spieler, die
  -- im selben Moment den letzten Platz eines 3er-Teams beanspruchen, lesen beide
  -- "2 von 3" und schreiben beide. Das Team haette vier Mitglieder, und
  -- durchsetzen laesst sich die Groesse hier nicht per Constraint.
  select * into v_team from participants p
    where p.tournament_id = p_tournament_id
      and p.join_code is not null
      and upper(p.join_code) = v_code
    for update;
  if v_team.id is null then
    raise exception 'Diesen Team-Code gibt es hier nicht.' using errcode = 'P0002';
  end if;

  select count(*) into v_taken from participants p where p.team_id = v_team.id;
  if v_taken >= v_team_size then
    raise exception 'Dieses Team ist schon vollzaehlig (% von %).', v_taken, v_team_size
      using errcode = '23505';
  end if;

  update participants
     set team_id = v_team.id, is_captain = false
   where id = v_me.id;

  return query select v_team.id, v_team.display_name;
end;
$$;

revoke all on function public.join_team(uuid, text) from public, anon;
grant execute on function public.join_team(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- leave_team: austreten, und dabei kein verwaistes Team zuruecklassen.
-- ---------------------------------------------------------------------------
create or replace function public.leave_team(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      participants%rowtype;
  v_team    uuid;
  v_left    int;
  v_has_cap boolean;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  perform public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null or v_me.team_id is null then
    return; -- nichts zu tun, und das ist kein Fehler
  end if;

  v_team := v_me.team_id;

  -- Dieselbe Sperre wie beim Beitritt: sonst treten zwei Mitglieder eines
  -- Zweier-Teams gleichzeitig aus, beide zaehlen noch einen Verbleibenden und
  -- keiner raeumt das leere Team ab.
  perform 1 from participants where id = v_team for update;

  update participants set team_id = null, is_captain = false where id = v_me.id;

  select count(*), bool_or(is_captain) into v_left, v_has_cap
    from participants p where p.team_id = v_team;

  if v_left = 0 then
    -- Ein Team ohne Menschen wuerde als Wettkaempfer im Bracket landen.
    delete from participants where id = v_team;
  elsif v_has_cap is not true then
    -- Der Captain ist gegangen: der laengste Verbleibende rueckt nach, damit das
    -- Team jemanden hat, der es umbenennen oder aufloesen darf.
    update participants set is_captain = true
     where id = (select p.id from participants p
                  where p.team_id = v_team
                  order by p.created_at, p.id
                  limit 1);
  end if;
end;
$$;

revoke all on function public.leave_team(uuid) from public, anon;
grant execute on function public.leave_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rename_team / remove_from_team / disband_team: was der Captain darf.
-- ---------------------------------------------------------------------------
-- Ohne diese drei ist ein Team, das einmal steht, unveraenderlich: ein Tippfehler
-- im Namen bleibt bis zum Turnierende stehen, ein Mitspieler, der doch nicht
-- kommt, belegt dauerhaft einen Platz, und ein versehentlich gegruendetes Team
-- laesst sich nur aufloesen, indem alle Mitglieder einzeln austreten.
create or replace function public.rename_team(p_tournament_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   participants%rowtype;
  v_name text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'Bitte einen Teamnamen angeben.' using errcode = '22023';
  end if;

  perform public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null or v_me.team_id is null or not v_me.is_captain then
    raise exception 'Nur der Captain kann das Team umbenennen.' using errcode = '42501';
  end if;

  update participants set display_name = v_name where id = v_me.team_id;
end;
$$;

revoke all on function public.rename_team(uuid, text) from public, anon;
grant execute on function public.rename_team(uuid, text) to authenticated;

create or replace function public.remove_from_team(p_tournament_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me participants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  perform public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null or v_me.team_id is null or not v_me.is_captain then
    raise exception 'Nur der Captain kann Mitglieder entfernen.' using errcode = '42501';
  end if;
  if p_member_id = v_me.id then
    raise exception 'Zum Verlassen des eigenen Teams gibt es leave_team.' using errcode = '22023';
  end if;

  update participants
     set team_id = null, is_captain = false
   where id = p_member_id and team_id = v_me.team_id;
end;
$$;

revoke all on function public.remove_from_team(uuid, uuid) from public, anon;
grant execute on function public.remove_from_team(uuid, uuid) to authenticated;

create or replace function public.disband_team(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   participants%rowtype;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  perform public.assert_team_phase(p_tournament_id);

  select * into v_me from participants p
    where p.tournament_id = p_tournament_id and p.user_id = auth.uid();
  if v_me.id is null or v_me.team_id is null or not v_me.is_captain then
    raise exception 'Nur der Captain kann das Team aufloesen.' using errcode = '42501';
  end if;

  v_team := v_me.team_id;

  -- Erst die Menschen loesen, dann die Huelle loeschen. Die umgekehrte
  -- Reihenfolge liefe zwar auch (der Fremdschluessel ist on delete set null),
  -- aber so steht die Absicht im Code statt im Verhalten des Fremdschluessels.
  update participants set team_id = null, is_captain = false where team_id = v_team;
  delete from participants where id = v_team;
end;
$$;

revoke all on function public.disband_team(uuid) from public, anon;
grant execute on function public.disband_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_registration: eine Abfrage, die den Anmeldebildschirm vollstaendig
-- beantwortet.
-- ---------------------------------------------------------------------------
-- Der Bildschirm muss drei Dinge unterscheiden koennen, und get_my_team allein
-- kann das nicht: "gar nicht angemeldet" und "angemeldet, aber ohne Team" sehen
-- dort beide wie null Zeilen aus.
create or replace function public.get_my_registration(p_tournament_id uuid)
returns table (
  participant_id  uuid,
  display_name    text,
  participant_typ participant_type,
  checked_in      boolean,
  team_id         uuid,
  team_name       text,
  join_code       text,
  is_captain      boolean,
  team_size       int,
  members_count   int,
  team_ready      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    me.id,
    me.display_name,
    me.type,
    me.checked_in_at is not null,
    t.id,
    t.display_name,
    t.join_code,
    me.is_captain,
    tour.team_size,
    (select count(*)::int from participants x where x.team_id = t.id),
    t.checked_in_at is not null
  from participants me
  join tournaments  tour on tour.id = me.tournament_id
  left join participants t on t.id = me.team_id
  where me.tournament_id = p_tournament_id
    and me.user_id = auth.uid()
    and auth.uid() is not null;
$$;

revoke all on function public.get_my_registration(uuid) from public, anon;
grant execute on function public.get_my_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_team: die Mitspieler, mit fest gewaehlten Spalten.
-- ---------------------------------------------------------------------------
-- Bewusst eine Funktion statt einer SELECT-Policy: authenticated hat SELECT auf
-- allen Spalten von participants. Eine Zeilen-Policy "sieh deine Mitspieler"
-- gaebe damit auch deren birthdate frei. Hier steht die Spaltenauswahl im Rumpf
-- und laesst sich vom Aufrufer nicht erweitern.
create or replace function public.get_my_team(p_tournament_id uuid)
returns table (
  member_id         uuid,
  member_name       text,
  member_gamertag   text,
  member_is_captain boolean,
  member_checked_in boolean,
  member_is_me      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.display_name,
    m.gamertag,
    m.is_captain,
    m.checked_in_at is not null,
    m.user_id is not distinct from auth.uid()
  from participants me
  join participants m on m.team_id = me.team_id
  where me.tournament_id = p_tournament_id
    and me.user_id = auth.uid()
    and auth.uid() is not null
    and me.team_id is not null
  order by m.is_captain desc, m.created_at, m.id;
$$;

revoke all on function public.get_my_team(uuid) from public, anon;
grant execute on function public.get_my_team(uuid) to authenticated;
