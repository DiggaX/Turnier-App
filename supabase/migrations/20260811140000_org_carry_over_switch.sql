-- Ein Schalter fuer die Uebernahme am Einlass.
--
-- Wiederkehrende Kinder haben ihren QR-Code vom letzten Turnier dabei. Steht
-- dieser Schalter an, bietet der Scanner an, sie ins laufende Turnier zu
-- uebernehmen: carry_over_participant() legt eine neue Zeile an und kopiert
-- dabei die user_id der Person.
--
-- Standard AUS, und das ist keine Zurueckhaltung, sondern die Folge dessen, was
-- dabei passiert: es wird eine FREMDE auth.users-Id auf eine neue Anmeldung
-- geschrieben. Genau das verbietet participants_insert_staff mit seiner
-- Bedingung user_id IS NULL (siehe docs/HANDOVER.md §5). Diese Policy bleibt
-- unangetastet; die Uebernahme ist die schmale Tuer daneben, und sie geht nur
-- auf, wenn eine Organisation sie ausdruecklich aufschliesst.
alter table organizations
  add column if not exists allow_carry_over boolean not null default false;

comment on column organizations.allow_carry_over is
  'Darf die Orga am Einlass eine Person aus einem frueheren Turnier derselben Organisation in das laufende uebernehmen? AUS: der Scanner zeigt einen fremden Code nur an. AN: er bietet die Uebernahme an, und carry_over_participant() legt eine neue Zeile mit kopierter user_id an. Standard aus, weil dabei eine fremde auth.users-Id geschrieben wird.';

-- Die beiden folgenden Grants sind REDUNDANT, und das steht hier, damit niemand
-- daraus eine Regel ableitet: organizations traegt TABELLEN-Grants
-- (anon=arwdDxtm, authenticated=arwdDxtm), keine Spalten-Grants. Eine neue
-- Spalte ist damit ohnehin erreichbar. Nachgemessen an relacl, nachdem die
-- Vermutung "hier gelten Spalten-Grants" beim Pruefen umgefallen ist —
-- information_schema.column_privileges zeigt aus Tabellen-Grants abgeleitete
-- Spaltenrechte und sieht deshalb genauso aus wie echte Spalten-Grants.
--
-- Sie bleiben trotzdem stehen: sie schaden nicht und benennen die Absicht.
-- ⚠️ Was den Schalter wirklich schuetzt, ist NICHT ein Grant, sondern die RLS:
-- orgs_write_staff_same_org verlangt fuer jeden Schreibzugriff
-- is_staff() AND id = current_org_id(). Lesen darf ihn jeder — orgs_select_public
-- steht auf USING (true) — und das ist in Ordnung: ein Boolean ueber Tuerpolitik
-- ist keine personenbezogene Angabe. Wer hier absichern will, aendert die Policy,
-- nicht den Grant.
grant select (allow_carry_over) on organizations to authenticated;
grant update (allow_carry_over) on organizations to authenticated;
