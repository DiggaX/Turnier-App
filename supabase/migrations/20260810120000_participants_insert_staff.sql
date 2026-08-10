-- Nachmeldung an der Tür: die Orga darf einen Teilnehmer selbst anlegen.
--
-- Bisher gab es auf participants nur participants_insert_self
-- (with check user_id = auth.uid()) — also ausschließlich Selbstanmeldung über
-- /t/[id]/register. Diese Seite ist aber an status='registration' gebunden.
-- Wer nach dem Start noch dazukommt, war damit gar nicht eintragbar: der
-- einzige Weg führte über ein manuelles Zurücksetzen des Turnierstatus.
--
-- user_id is null ist Absicht und keine Bequemlichkeit: der Staff-Pfad legt
-- ausschließlich kontenlose Walk-ins an. Ohne diese Bedingung könnte ein
-- Staff-Mitglied eine Anmeldung auf eine fremde auth.users-Id schreiben; so
-- bleibt "im Namen von jemandem anlegen" auch technisch ausgeschlossen. Ein
-- so angelegter Teilnehmer hat folglich keinen Recovery-Link und keine
-- Fotoerlaubnis — beides gehört der Person, nicht der Orga.
create policy "participants_insert_staff" on participants
  for insert
  with check (
    user_id is null
    and public.is_staff()
    and exists (
      select 1 from tournaments t
      where t.id = participants.tournament_id
        and t.org_id = public.current_org_id()
    )
  );
