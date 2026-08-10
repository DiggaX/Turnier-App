-- Fotoerlaubnis wird optional — und bildet das Papierformular ab.
--
-- Bisher war die Medien-Einwilligung eine Zutrittsbedingung: der Trigger
-- trg_checkin_requires_consent (20260618090000_checkin.sql) hat jeden Check-in
-- ohne gültige Einwilligung abgelehnt, Minderjährige kamen ohne Eltern-
-- Unterschrift gar nicht ins Turnier. Das ist eine Entscheidung, die dem
-- Veranstalter gehört, nicht der Datenbank: wer nicht fotografiert werden will,
-- nimmt trotzdem teil. Ab hier ist die Einwilligung genau das, was auf dem
-- Papierformular steht — eine freiwillige Fotoerlaubnis. Ihr Vorliegen wird nur
-- noch angezeigt (blaues Badge beim Check-in), nie erzwungen.
--
-- Dazu die Felder, die das Formular hat und uns fehlten: die Anschrift des
-- Einwilligenden ("wohnhaft") und der Wortlaut, dem tatsächlich zugestimmt
-- wurde. Der Wortlaut nennt die verantwortliche Stelle mit Anschrift, deshalb
-- bekommt auch organizations eine Adresse.

-- 1. Gate weg
drop trigger if exists trg_checkin_requires_consent on participants;
drop function if exists public.enforce_consent_before_checkin();
-- nur vom Trigger benutzt; check_in() ruft sie nicht auf
drop function if exists public.participant_has_valid_consent(uuid);

-- 2. Papierformular abbilden
alter table consents add column if not exists address text;
alter table consents add column if not exists consent_text text;

comment on column consents.address is
  'Anschrift des Einwilligenden ("wohnhaft" auf dem Papierformular). In der UI Pflicht, sobald die Fotoerlaubnis erteilt wird; nullable wegen der Zeilen von vorher.';
comment on column consents.consent_text is
  'Wortlaut, dem zugestimmt wurde, inklusive verantwortlicher Stelle. Snapshot: der Text kann sich ändern, eine erteilte Einwilligung nicht rückwirkend.';

-- 3. Verantwortliche Stelle für diesen Wortlaut
alter table organizations add column if not exists address text;

comment on column organizations.address is
  'Postanschrift der verantwortlichen Stelle. Erscheint im Einwilligungstext der öffentlichen Anmeldung; wird unter /organizer/members gepflegt.';

-- 4. Eine Einwilligung pro Anmeldung.
-- consent-step.tsx behandelt diese Verletzung längst ("bereits erteilt"), nur
-- der Index dazu fehlte — Doppelzeilen waren bisher möglich.
create unique index if not exists consents_participant_id_key on consents (participant_id);

-- Kein RLS-Change nötig: consents_insert_owner deckt den Insert der neuen
-- Spalten mit ab, und orgs_select_public (using (true)) macht die Org-Anschrift
-- auf der öffentlichen Anmeldeseite lesbar — genau dafür ist sie da.
