-- Die Zuordnung Mensch -> Team, als Selbstbezug auf participants.
--
-- Warum kein eigenes `teams`: matches.participant_a_id/_b_id/winner_id zeigen auf
-- participants, ebenso match_reports.reported_by. Eine zweite Wettkaempfer-Tabelle
-- haette jede dieser Spalten, jede Bracket-Funktion, jedes Format und das
-- oeffentliche Board angefasst. Bleibt das Team eine participants-Zeile, aendert
-- sich an all dem nichts — es kommt nur eine Sorte Zeile dazu, die *nicht*
-- antritt. Der Preis steht in 20260811092000: jede Abfrage muss ab jetzt sagen,
-- ob sie Wettkaempfer oder Menschen meint.
--
-- Die Aufteilung der Rollen auf die Spalten:
--   Team-Zeile:   type='team',   team_id is null, user_id is null, join_code gesetzt
--   Person-Zeile: type='player', team_id -> Team ODER NULL (noch kein Team),
--                                user_id = eigener Auth-User
--   Einzelstart:  type='solo',   team_id is null, user_id gesetzt (unveraendert)
--
-- Wer antritt, entscheidet `type`, nicht `team_id`. Das ist keine Feinheit: ein
-- Spieler ohne Team traegt team_id NULL, und ein geloeschtes Team setzt team_id
-- seiner Mitglieder auf NULL. Haengte "Wettkaempfer" an team_id, stuenden diese
-- Menschen im Turnierbaum und ihre Klarnamen waeren oeffentlich lesbar — beides
-- in einer Rollback-Probe auf dieser Datenbank nachgestellt.
--
-- Entscheidend ist, dass die Team-Zeile KEIN user_id traegt. Damit bleibt
-- `unique (tournament_id, user_id)` unangetastet: der Captain besitzt genau eine
-- Zeile, naemlich seine eigene Person. Haetten wir seine uid auf die Team-Zeile
-- geschrieben, muesste der Unique-Index fallen — und die drei Stellen, die den
-- Teilnehmer per .eq("user_id", uid).maybeSingle() suchen (me/page.tsx,
-- me/push-actions.ts, checkin-station/page.tsx), bekaemen bei zwei Treffern einen
-- PostgREST-Fehler und wuerden ihn als "nicht angemeldet" auslegen. Der Captain
-- haette seine Statusseite verloren, ohne dass irgendwo ein Fehler auftaucht.
--
-- on delete set null, nicht cascade: wird ein Team geloescht, sind seine Spieler
-- Menschen, die sich selbst angemeldet und eine Fotoerlaubnis abgegeben haben.
-- Die duerfen nicht mitsterben — sie werden wieder zu Spielern ohne Team, und die
-- Orga ordnet sie neu zu. (team_members hing frueher an cascade, aber das waren
-- Zeichenketten, keine Personen.)

alter table participants
  add column if not exists team_id    uuid references participants(id) on delete set null,
  add column if not exists is_captain boolean not null default false,
  add column if not exists join_code  text;

-- Eine Zeile kann nicht ihr eigenes Team sein. Tiefere Verschachtelung (Team in
-- Team) faengt der Trigger in 20260811092000 ab — dafuer muss man die Zielzeile
-- lesen, und das kann ein CHECK nicht.
alter table participants
  drop constraint if exists participants_team_id_not_self;
alter table participants
  add constraint participants_team_id_not_self check (team_id is distinct from id);

-- Ein Team kann selbst kein Mitglied sein. Der CHECK haengt an `type`, nicht am
-- Beitritts-Code: eine aus team_members uebernommene Alt-Zeile ist type='team'
-- ohne Code und wuerde einer Bedingung ueber join_code entgehen. Die andere
-- Richtung (zeigt team_id auf eine echte Team-Zeile desselben Turniers?) braucht
-- einen Blick auf die Zielzeile und steht deshalb im Trigger in 20260811092000.
alter table participants
  drop constraint if exists participants_team_row_not_nested;
alter table participants
  add constraint participants_team_row_not_nested
  check (type <> 'team' or team_id is null);

-- Postgres indiziert Fremdschluessel nicht von selbst. Ohne diesen Index ist
-- jedes "zeig mir die Spieler dieses Teams" ein Seq Scan, und `on delete set null`
-- muss beim Loeschen eines Teams die ganze Tabelle durchgehen.
create index if not exists participants_team_id_idx
  on participants (team_id) where team_id is not null;

-- Der Beitritts-Code ist pro Turnier eindeutig, nicht global: zwei Turniere
-- duerfen "TGN7" gleichzeitig vergeben. upper() macht die Eingabe
-- gross-/kleinschreibungsblind — join_team() vergleicht ueber dieselbe Funktion.
create unique index if not exists participants_join_code_key
  on participants (tournament_id, upper(join_code)) where join_code is not null;

-- Geburtsdatum wird optional, aber nur fuer Zeilen ohne Auth-User. Zwei Sorten
-- brauchen es nicht: die Team-Zeile (kein Mensch) und von der Orga am Tresen
-- angelegte Walk-ins. Wer sich selbst anmeldet, hat einen user_id und muss es
-- weiterhin angeben — sonst kann requiredConsentMethod() in
-- web/src/lib/consent.ts nicht entscheiden, ob eine Unterschrift noetig ist,
-- und faellt bei einem Minderjaehrigen still auf die Checkbox zurueck.
--
-- Der bestehende participants_birthdate_check (>= 1900-01-01, <= current_date)
-- bleibt und vertraegt NULL: ein CHECK, der zu NULL auswertet, gilt als erfuellt.
alter table participants alter column birthdate drop not null;

alter table participants
  drop constraint if exists participants_birthdate_required_for_accounts;
alter table participants
  add constraint participants_birthdate_required_for_accounts
  check (user_id is null or birthdate is not null);

comment on column participants.team_id is
  'Zeigt auf die Team-Zeile desselben Turniers. NULL heisst NICHT "tritt an" — ein Spieler ohne Team hat ebenfalls NULL. Wer antritt, entscheidet AUSSCHLIESSLICH type: Wettkaempfer = type in (solo, team), Mensch = type in (solo, player).';

comment on column participants.join_code is
  'Beitritts-Code, nur auf Team-Zeilen gesetzt. Pro Turnier eindeutig, Vergleich ueber upper().';

comment on column participants.is_captain is
  'Nur auf Person-Zeilen sinnvoll. Der Captain darf das Team umbenennen und aufloesen; melden und starten darf jedes Mitglied.';
