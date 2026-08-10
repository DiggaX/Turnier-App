-- Nachmeldung eines Teams: die Orga darf auch dessen Mitglieder eintragen.
--
-- team_members_write_owner verlangt participants.user_id = auth.uid(). Ein per
-- participants_insert_staff angelegter Walk-in hat aber definitionsgemäß kein
-- Konto, also gehört die Zeile niemandem — die Orga kam damit an die Aufstellung
-- nicht heran und ein 3v3-Team stand ohne Spieler im Turnier.
--
-- Die Bedingung user_id is null zieht die Grenze an derselben Stelle wie dort:
-- Staff pflegt ausschließlich kontenlose Walk-ins. Wer sich selbst angemeldet
-- hat, behält seine Aufstellung — an die kommt weiterhin nur er selbst.
create policy "team_members_insert_staff" on team_members
  for insert
  with check (
    public.is_staff_of_participant_org(participant_id)
    and exists (
      select 1 from participants p
      where p.id = team_members.participant_id
        and p.user_id is null
    )
  );
