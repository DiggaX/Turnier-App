-- Geburtsdatum: die Datenbank prüft jetzt selbst.
--
-- Die öffentliche Anmeldung hat keine Server-Action. onSubmit in
-- register-client.tsx schreibt mit dem Anon-Key direkt in participants, unter
-- RLS. Die zod-Prüfung im Formular ist damit eine Freundlichkeit gegenüber dem
-- Ausfüllenden, keine Sicherung: wer das Formular umgeht, umgeht die Regel.
-- Hier steht die Stelle, an der ein von Hand abgesetztes POST nicht vorbeikommt.
--
-- current_date in einem CHECK ist Absicht, und die Richtung ist das Argument.
-- Die Schranke wandert nur nach vorne: eine Zeile, die am Tag ihrer Entstehung
-- gültig war, ist es an jedem späteren Tag auch. Ein pg_restore eines alten
-- Dumps kann dadurch nur nachsichtiger werden, nie strenger. Der CHECK, der
-- Restores zerlegt, ist das Spiegelbild (>= current_date, "darf nicht
-- abgelaufen sein") — der erklärt bestehende Zeilen mit der Zeit für ungültig.
--
-- Zwei Restränder, bewusst unbehandelt: ein Restore auf einer Maschine mit
-- zurückgestellter Uhr, und die Zeitzonen-Abhängigkeit von current_date
-- (Europe/Berlin liegt zwischen 22:00 und 24:00 einen Tag vor UTC). Beides
-- verlangt ein Geburtsdatum von *heute* — niemand meldet ein Neugeborenes an.
-- Falls es je auffällt: <= (current_date + 1).
--
-- Grenzen wie validBirthdate() in web/src/lib/consent.ts: 1900-01-01 gilt noch,
-- 1899-12-31 nicht. Bestandsdaten vorher geprüft: 21 Zeilen, Minimum
-- 1992-07-30, keine in der Zukunft, keine vor 1900 — deshalb kein "not valid",
-- kein Aufräumen.
--
-- Vor dem Anwenden in zurückgerollten Transaktionen bewiesen: current_date wird
-- im CHECK angenommen (Postgres speichert ihn als CURRENT_DATE), ein Datum 30
-- Tage in der Vergangenheit geht durch, morgen und 1823-04-10 kommen beide mit
-- SQLSTATE 23514 zurück — nicht 23502, die Zeile war also vollständig und der
-- CHECK hat sie abgelehnt, nicht eine fehlende Pflichtspalte.
alter table participants
  add constraint participants_birthdate_check
  check (birthdate >= date '1900-01-01' and birthdate <= current_date);

comment on constraint participants_birthdate_check on participants is
  'Reales Geburtsdatum: nicht in der Zukunft, nicht vor 1900. Spiegelt validBirthdate() in web/src/lib/consent.ts; die oeffentliche Anmeldung schreibt ohne Server-Action direkt mit dem Anon-Key, deshalb liegt die Pruefung zusaetzlich hier.';
