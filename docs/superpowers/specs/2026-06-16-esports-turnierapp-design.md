# Esports-Turnierapp — Design-Spec

**Datum:** 2026-06-16
**Status:** Entwurf zur Abnahme
**Autor:** Rene + Claude (Brainstorming)

## 1. Ziel

Web-App zur Verwaltung von Esports-Turnieren. Ein Veranstalter (Single-Organizer)
legt Turniere an; Teilnehmer registrieren sich mobil, checken vor Ort oder online
ein und tragen ihre Match-Ergebnisse selbst ein. Ein öffentliches Live-Board zeigt
Bracket, laufende Matches und Tabellen in Echtzeit. Öffentlich gehostet, unabhängig
von lokalem Netzwerk.

## 2. Scope

### MVP (Phase 1)
- Single-Organizer (Veranstalter/Team legt Turniere an, kein Multi-Tenant)
- Teilnehmer = Einzelspieler **oder** Team (mit Roster)
- Formate: **Single Elimination** + **Round Robin**
- Registrierung: Gast-Form (ohne E-Mail) + E-Mail Magic Link + E-Mail/Passwort
- Einwilligung Medien (Bild/Ton/Video) inkl. Minderjährigen-/Eltern-Logik
- Hybrid-Check-in: QR (Orga scannt Spieler) + Stations-QR (Self-Check-in) + Online-Button
- Ergebnis-Flow: beide Seiten melden → Schiedsrichter gibt frei
- Live-Board (öffentliche URL, Realtime, Beamer-Vollbild)

### Phase 2
- Formate: **Double Elimination**, **Swiss**, **Gruppen → Playoffs**
- **Web Push** Benachrichtigungen (Android + iOS-PWA ab 16.4)
- Erweiterte Stationsverwaltung, Statistiken

### Out of Scope (vorerst)
- Multi-Tenant-Plattform (jeder erstellt eigene Turniere)
- Preisgelder / Zahlungen
- Native Apps (iOS/Android Store)

## 3. Stack & Architektur

- **Frontend/Backend:** Next.js (App Router) auf **Vercel**
- **Datenbank/Auth/Realtime/Storage:** **Supabase** (Postgres + RLS, Auth, Realtime, Storage)
- **Mobile:** PWA (installierbar, Kamera für QR, später Web Push) — kein nativer Store
- **Sprache:** Deutsch primär, i18n-fähig aufgebaut

Datenfluss: Clients (Teilnehmer-PWA, Orga-/Schiri-Dashboard, Live-Board) → Next.js
→ Supabase. Supabase Realtime pusht Live-Updates an das Live-Board (Bracket
aktualisiert sich ohne Reload).

## 4. Rollen & Rechte

| Rolle | Rechte |
|-------|--------|
| **Owner/Admin** | Alles, Nutzer- & Event-Verwaltung |
| **Turnierleiter** | Turniere anlegen, Teilnehmer verwalten, Bracket steuern, Seeding |
| **Schiedsrichter** | Check-in scannen, Ergebnisse prüfen/freigeben, Streitfälle entscheiden |
| **Teilnehmer** | Registrieren, einchecken, eigenes Ergebnis melden |
| **Zuschauer** | Live-Board read-only (kein Login) |

Rechte werden in Postgres per **Row Level Security (RLS)** durchgesetzt.

## 5. Datenmodell (Kern-Tabellen)

**Identität & Event**
- `users` — Orga/Admin/Schiri (Supabase Auth), Rolle
- `games` — Spiel-Katalog: Name, Team-Größe (z.B. Valorant=5, FIFA=1)
- `tournaments` — Name, Spiel, Format, Modus (LAN/Online/Hybrid), Status, Datum, Settings (Seeding-Modus, Tie-Break-Regeln)
- `stations` — optionale Spielstationen/PCs pro Turnier (für „Aufruf an Station X")

**Teilnehmer**
- `participants` — pro Turnier: Typ (Solo|Team), Anzeigename, Gamertag, Geburtsdatum, Seed, **QR-Token** (eindeutig), Check-in-Status, Einwilligungs-Status
- `team_members` — bei Teams: Name, Gamertag, Captain-Flag
- `consents` — Typ (Medien), erteilt_von (selbst|erziehungsberechtigt), Name, Signatur-Ref (Storage), Methode (Checkbox|Signatur|Link), Zeitstempel

**Turnierverlauf**
- `stages` — Turnier kann mehrere Phasen haben (z.B. Gruppe → Playoff)
- `matches` — Stage, Runde, Slot, Teilnehmer A/B, Station, Status, Zeitplan
- `match_reports` — **je Seite ein Eintrag**: gemeldet_von, Score A/B, Zeit
- `match_results` — finaler Score, Gewinner, freigegeben_von (Schiri), Status (offen|bestätigt|streit)
- `check_ins` — Teilnehmer, Zeit, Methode (QR-Scan|Station|Online), von wem

Standings/Tabellen (Round Robin, später Swiss) werden aus `match_results`
berechnet (View oder Service-Funktion), nicht doppelt gespeichert.

## 6. Registrierung & Einwilligung

**Registrierung so einfach wie möglich** — Zielgruppe u.a. Kinder mit Handy, oft
ohne E-Mail. Hauptweg: **Gast-Form** (Anzeigename + Gamertag + Geburtsdatum), kein
Login nötig; Teilnehmer erhält eindeutigen Link/QR. Optional E-Mail Magic Link oder
E-Mail/Passwort für Wiederkehrende/Orga.

**Einwilligung Medien** (Bild/Ton/Video für Social Media/Dritte) ist **Pflicht zur
Teilnahme**. Ablauf altersabhängig:

- **Erwachsen (18+):** eigene Zustimmung per Checkbox bei Registrierung.
- **Minderjährig:**
  - *Elternteil meldet Kind an* → Erziehungsberechtigter trägt Namen ein + Checkbox = digitale Einwilligung inline (keine separate Mail nötig).
  - *Kind meldet sich selbst an* → Einwilligung **vor Ort beim Check-in**: Erziehungsberechtigter unterschreibt digital auf Orga-Tablet. Bei reinen Online-Events: Eltern-Einwilligungs-Link/QR, den das Kind weitergibt.

**Harte Sperre:** Ohne gültige Einwilligung kein Check-in, kein Spiel. Orga sieht
Status (grün/rot) in der Teilnehmerliste.

**Rechtlicher Rahmen (DE):** DSGVO + KUG. Minderjährige können der Bildverwertung
nicht allein wirksam zustimmen → Erziehungsberechtigte willigen ein. Einwilligungs-
texte und Datenaufbewahrung (Löschkonzept nach Event) sind mit Veranstalter/Rechts-
beratung final abzustimmen. Signaturen liegen in Supabase Storage (Zugriff per RLS).

## 7. Check-in (Hybrid)

Drei Wege, je nach Event-Modus:

1. **Orga scannt Spieler (Pattern A):** Spieler zeigt persönlichen QR (Handy/Bestätigung), Orga scannt mit Laptop-Webcam oder Orga-Handy → anwesend.
2. **Spieler scannt Station (Pattern B):** Orga zeigt EINEN Stations-QR (Beamer/Ausdruck), Spieler scannt mit eigenem Handy → Self-Check-in.
3. **Online-Button:** Bei Remote-Events Check-in per Klick im Zeitfenster.

Jeder Check-in prüft den Einwilligungs-Gate. Erst nach gültigem Check-in kommt der
Teilnehmer ins Bracket/Seeding.

## 8. Turnier-Generator & Formate

Orga wählt **Format + Teilnehmerzahl + Seeding** (Zufall / manuell / nach Rang) →
System erzeugt automatisch Bracket, Gruppen oder Spielplan.

- **Single Elimination (MVP):** K.O.-Baum, behandelt Freilose (nicht-2er-Potenzen).
- **Round Robin (MVP):** jeder gegen jeden, Tabelle mit Tie-Break-Regeln.
- **Double Elimination (P2):** Winner- + Loser-Bracket.
- **Swiss (P2):** Paarung gleichstarker Teilnehmer pro Runde.
- **Gruppen → Playoffs (P2):** Gruppenphase, danach Playoff-Bracket (mehrere `stages`).

## 9. Match-Ergebnisse & Schiedsrichter-Flow

1. Beide Seiten (Teilnehmer A und B) tippen ihren Score in der eigenen Match-Ansicht (`match_reports`).
2. Schiedsrichter sieht beide Meldungen.
3. **Übereinstimmung** → ein Tap Freigabe → `match_results` bestätigt → Bracket rückt vor (Realtime), nächste Paarung entsteht.
4. **Abweichung** → Streit-Flag, Schiedsrichter entscheidet manuell.

LAN-Variante: Schiri kann Ergebnis auch direkt eintragen.

## 10. Live-Board & Realtime

- Eigene **öffentliche URL pro Turnier**, kein Login.
- Aktualisiert sich per **Supabase Realtime** live (kein Reload).
- **Beamer-Vollbild**-Modus.
- Zeigt: Bracket, laufende Matches („LIVE"), **„Aufruf an Station X"**, Tabellen (RR/Swiss).

## 11. Benachrichtigungen

- **Baseline (MVP):** In-App-Realtime — offene App zeigt „dein Match läuft" + Board-Aufruf an Station. Immer zuverlässig.
- **Phase 2:** Web Push (Service Worker). Android Chrome/Firefox ohne Installation; iOS nur als Homescreen-PWA ab iOS 16.4. Kein alleiniger Verlass auf Push.

## 12. Nicht-funktionale Anforderungen

- **PWA:** installierbar, Offline-Shell, Kamera-Zugriff (QR), Add-to-Homescreen.
- **Sicherheit:** RLS auf allen Tabellen; QR-Tokens nicht erratbar; Signaturen/PII zugriffsgeschützt; Input-Validierung an Systemgrenzen.
- **Datenschutz:** DSGVO-konform; Löschkonzept für Minderjährigen-/Mediendaten nach Event.
- **i18n:** Deutsch primär, übersetzbar aufgebaut.
- **Barrierefreiheit:** Konturen/Kontrast, Tastatur, Screenreader-Grundlagen.
- **Hosting/Deploy:** Vercel (Preview + Prod), Supabase-Projekt mit Migrationen.

## 13. Offene Punkte (vor/in Review zu klären)

- Tie-Break-Regeln Round Robin (Siege → direkter Vergleich → Differenz?).
- Stationsverwaltung-Umfang im MVP (nur Anzeige vs. aktive Zuweisung).
- Einwilligungstext-Inhalte + Aufbewahrungsfristen (rechtlich).
- Branding/Theme (wird in Bau-Phase via `frontend-design` / `ui-ux-pro-max` festgelegt).
- Mehrere parallele Turniere pro Event — angenommen ja, bestätigen.

## 14. Phasen-Zusammenfassung

| Phase | Inhalt |
|-------|--------|
| **MVP** | Single-Elim + Round Robin, Solo+Team, Gast-Reg + Einwilligung, Hybrid-Check-in, Dual-Report-Ergebnisse, Live-Board, In-App-Notifications |
| **Phase 2** | Double-Elim, Swiss, Gruppen→Playoffs, Web Push, erweiterte Stats |
