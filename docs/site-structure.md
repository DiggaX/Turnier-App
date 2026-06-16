# Turnier-App — Seitenstruktur / Informationsarchitektur

Zweck: Vorlage für den UI-/Design-Aufbau. Listet alle Seiten (Routen), ihre Hierarchie,
Navigation und den Zugriff (öffentlich / Teilnehmer / Orga). **Mobile-first, PWA.**
Status: ✅ = gebaut · 🔜 = geplant (Plan N).

## 3 Bereiche & Zugriff

1. **Öffentlich** — kein Login. Turniere ansehen, sich anmelden, Live-Board.
2. **Teilnehmer** — Gast (Supabase Anonymous Auth) oder Account. Eigener Status, Check-in, Ergebnis melden.
3. **Orga / Schiri** — Login (E-Mail+Passwort oder Magic-Link), Rolle `organizer/admin/referee`. Turniere verwalten.

---

## Routen-Map

| Route | Zweck | Zugriff | Status |
|-------|-------|---------|--------|
| `/` | Landing / Turnier-Übersicht: Liste offener & laufender Turniere, Einstieg zu Anmeldung + Live-Board | Öffentlich | ✅ (Basis) |
| `/t/[id]` | Turnier-Detail (öffentlich): Spiel, Format, Status, Datum; Buttons „Anmelden" + „Live-Board" | Öffentlich | 🔜 (P4) |
| `/t/[id]/register` | Registrierung (Gast/Account) + Einwilligung (Alters-Gate, Eltern-Signatur) | Öffentlich | ✅ |
| `/t/[id]/board` | Öffentliches **Live-Board**: Bracket, laufende Matches, Tabellen, „Aufruf an Station X" | Öffentlich (read-only) | 🔜 (P6) |
| `/t/[id]/me` | Teilnehmer-Status: angemeldet?, Einwilligung?, **persönlicher Check-in-QR**, nächstes Match, Ergebnis melden | Teilnehmer | 🔜 (P3/P5) |
| `/login` | Orga-Login: E-Mail+Passwort **und** Magic-Link | Öffentlich | ✅ |
| `/auth/confirm` | Magic-Link-Callback (kein UI, leitet weiter) | System | ✅ |
| `/organizer` | **Orga-Dashboard**: Turnier-Liste, Schnellzugriff, Logout | Orga | ✅ |
| `/organizer/tournaments/new` | Turnier anlegen (Generator: Spiel, Format, Seeding, Modus) | Orga | 🔜 (P4) |
| `/organizer/tournaments/[id]` | Turnier-Übersicht & Steuerung (Status, Phasen) | Orga | 🔜 (P4) |
| `/organizer/tournaments/[id]/participants` | Teilnehmerliste + Consent-Status (grün/rot) + Check-in-Status | Orga | ✅ |
| `/organizer/tournaments/[id]/checkin` | **Check-in-Scanner** (Kamera scannt Spieler-QR) + Stations-QR + Anwesenheitsliste | Orga/Schiri | 🔜 (P3) |
| `/organizer/tournaments/[id]/bracket` | Bracket/Spielplan generieren & steuern, seeden | Orga | 🔜 (P4) |
| `/organizer/tournaments/[id]/matches` | Match-Verwaltung, **Ergebnis-Freigabe** (Schiri), Streitfälle | Orga/Schiri | 🔜 (P5) |
| `/organizer/tournaments/[id]/stations` | Stationsverwaltung, „Aufruf an Station X" | Orga | 🔜 (P3/P6) |

---

## Navigation

### Öffentliche Top-Nav (alle öffentlichen Seiten)
- **Logo** → `/`
- **Turniere** → `/`
- **Anmelden (Orga)** → `/login`

### Teilnehmer-Kontext (innerhalb eines Turniers)
Schlanke, mobile-first Schritt-Navigation, kein Menü-Overhead:
`/t/[id]/register` → (nach Anmeldung) `/t/[id]/me` → Check-in → Match/Ergebnis.

### Orga-Bereich (nach Login)
- **Sidebar / Top:** Dashboard (`/organizer`), Logout.
- **Pro Turnier — Tab-Leiste** (`/organizer/tournaments/[id]/…`):
  `Übersicht` · `Teilnehmer` · `Check-in` · `Bracket` · `Matches` · `Stationen`

---

## Hinweise für den Aufbau

- **Dynamische Segmente:** `[id]` = Turnier-UUID, `[tournamentId]` analog (bestehende Registrierungs-Route nutzt `t/[tournamentId]/register`).
- **Mobile-first:** Teilnehmer-Seiten primär Handy (Kamera für QR). Live-Board zusätzlich Beamer-Vollbild.
- **Route-Gruppen (Next.js App Router):** `(auth)` für Login-Seiten (kein URL-Segment), `organizer/` als geschützter Bereich (Redirect → `/login` ohne Staff-Rolle).
- **Bereits gebaut:** `/`, `/login`, `/auth/confirm`, `/t/[tournamentId]/register`, `/organizer`, `/organizer/tournaments/[id]/participants`.
- **Status-getrieben:** Turniere haben Status `draft → registration → running → finished`; Navigation/Buttons (Anmelden, Check-in, Live) je nach Status ein-/ausblenden.
