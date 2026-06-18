# Live-Acceptance-Test — Turnier-App

**Live:** https://turnier-app-opal.vercel.app · **Stand:** 2026-06-18

Manueller End-to-End-Durchlauf der produktiv deployten App. Pro Schritt prüfen:
rendert korrekt? Fehler/Konsole sauber? Mobil-Layout ok?

---

## Deployment-Health-Check (automatisch verifiziert ✅)

| Route | Ergebnis |
|---|---|
| `/` Home | ✅ Org-Liste „EventpilotTurniere" |
| `/o/eventpilot` | ✅ listet Turniere mit Status-Badges |
| `/t/<id>/` Detail | ✅ Titel + „Jetzt anmelden"-CTA |
| `/t/<id>/board` | ✅ Live-Board rendert |

> Sommer Cup 2026 wurde für diesen Test **zurückgesetzt** (alle Test-/Debug-Teilnehmer
> + Bracket entfernt, Status → `registration`). Jetzt sauberes, offenes Turnier.

---

## Checkliste

### A. Org-Onboarding (Desktop)
- [ ] 1. `/signup` → neue Firma (Mail + PW + Firmenname) → landet auf `/organizer`.
- [ ] 2. `/organizer/members` → Einladung erstellen → Invite-Link kopieren.
- [ ] 3. Invite-Link im privaten Fenster → zweiter Account tritt bei → erscheint in Mitglieder-Liste.

### B. Turnier anlegen (Desktop, als Organizer)
- [ ] 4. `/organizer/tournaments/new` → Turnier anlegen (Spiel, Format, Teamgröße).
- [ ] 5. Übersicht → „Anmeldung öffnen" → Status „Anmeldung offen".

### C. Spieler-Flow (MOBIL, echtes Handy)
- [ ] 6. `/t/<id>` → „Jetzt anmelden" → Erwachsener (Checkbox-Consent) registriert.
- [ ] 7. Zweite Anmeldung als Minderjähriger (Geburtsdatum <18) → Unterschrift-Consent erscheint.
- [ ] 8. `/t/<id>/me` → QR-Code sichtbar + „Online einchecken" funktioniert.
- [ ] 9. `/t/<id>/checkin-station` an zweitem Gerät → QR scannen → „eingecheckt".

### D. Turnier durchspielen (Organizer)
- [ ] 10. Genug eingecheckt → Bracket-Tab → „zufällig setzen" → „generieren" → Status „läuft".
- [ ] 11. Result-Station `/organizer/tournaments/<id>/station` → Score → „Freigeben".
- [ ] 12. `/t/<id>/board` (ohne Login, zweites Gerät) → Score erscheint live.

### E. Web-Push (#3 — iOS: Seite zum Home-Bildschirm hinzufügen)
- [ ] 13. Push erlauben → Match-Benachrichtigung kommt auf echtem Gerät an.

### F. Multi-Tenant-Isolation
- [ ] 14. Als Org A eingeloggt → fremdes Turnier von Org B per URL → 404.

---

## Notizen / gefundene Bugs

(hier eintragen)
