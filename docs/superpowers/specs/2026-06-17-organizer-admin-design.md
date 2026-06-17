# Organizer-Admin — Design (Modul 1 von 2)

**Datum:** 2026-06-17
**Status:** Spec (zur Review)

## Ziel

Der Organisator kann Turniere **über die UI** anlegen, konfigurieren, im Status steuern und löschen, Spiele verwalten und Teilnehmer im Detail einsehen/bearbeiten/entfernen — ohne SQL. Heute existiert die ganze Turnier-Engine (Formate, Brackets, Ergebnisse, Board, Check-in, Push, Stationen), aber Turniere + Spiele wurden nur per SQL angelegt; eine Orga-CRUD-Schicht fehlt. Das blockt u.a. die Spieler-Anmeldung (das `/register`-Formular existiert, 404t aber, solange kein Turnier im Status `registration` ist — und es gibt keine UI, das umzuschalten).

## Scope & Abgrenzung

**Modul 1 (dieser Spec):** Single-Tenant Organizer-Admin — Turnier-CRUD, Status-Lifecycle, Spiele-Verwaltung, Teilnehmer-Detail, plus eine kritische Security-Härtung. **Org-ready** gebaut: `tournaments.created_by` wird gesetzt; spätere Org-Scoping-Änderungen sind additiv.

**Modul 2 (späterer, eigener Spec):** Multi-Tenancy / Organisationen — `organizations`-Tabelle, org-gescopte RLS überall, Mitglieder-Signup, Isolation pro Firma. **Nicht Teil dieses Specs.**

**Explizit raus (Modul 1):** Organisationen/Mandanten; Staff-Account-Selbstregistrierung (Organizer-Accounts entstehen weiter über einen `profiles`-Eintrag durch einen Admin/SQL — bestehende Annahme); Rollendifferenzierung (alle Staff sind gleich via `is_staff()`).

## Architektur

Folgt den bestehenden Mustern: Server Components für Seiten (staff-gated wie `matches/page.tsx`), Server Actions für Schreibzugriffe (mit `requireStaff`-Guard + `friendlyDbError`, `ActionResult`-Typ), `react-hook-form` + `zod` für Formulare (wie `register-client.tsx`), shadcn/ui + das bestehende Design-System. Reine Logik (Status-Übergänge, Edit-Guards) als getestete Pure Functions.

### Routen
| Route | Zweck |
|---|---|
| `/organizer` | Turnier-Liste (existiert) + **„＋ Neues Turnier"**-Button |
| `/organizer/tournaments/new` | Anlegen-Formular |
| `/organizer/tournaments/[id]` | **Übersicht** (bisher leerer Tab) — Fakten, Bearbeiten, Status-Steuerung, Löschen |
| `/organizer/games` | Spiele-Verwaltung |
| `/organizer/tournaments/[id]/participants/[pid]` | Teilnehmer-Detail |

Der `TournamentTabs`-Eintrag „Übersicht" (heute `segment: null`, dimmed) wird auf die Übersichtsroute verlinkt.

## Datenmodell-Änderungen (eine Migration)

1. **`tournaments.team_size`** — `int not null default 1 check (team_size >= 1)`. Pro-Turnier wählbar (1 = 1v1, 5 = 5v5). Das gewählte Spiel liefert beim Anlegen nur den Default (Prefill); maßgeblich ist der Turnier-Wert.
2. **Security-Härtung (kritisch):** Die heutigen Policies `tournaments_write_authenticated` und `games_write_authenticated` (`for all to authenticated using(true) with check(true)`) erlauben **jedem anonym eingeloggten Spieler**, Turniere/Spiele anzulegen/zu ändern/zu löschen. Ersetzen durch staff-only (`using public.is_staff() with check public.is_staff()`), analog zu `matches`/`participants`. Public-`select` bleibt.

Migration `supabase/migrations/20260627090000_organizer_admin.sql` (idempotent; vom User im SQL-Editor angewandt).

### Ripple: `game.team_size` → `tournament.team_size`
Die Stellen, die heute die Teamgröße aus dem Spiel lesen, auf das Turnier umstellen:
- `web/src/app/t/[tournamentId]/register/page.tsx` (`teamSize` für Solo-/Team-Anmeldung)
- `web/src/app/page.tsx` (Home — „5v5"-Chip)
- `web/src/app/t/[tournamentId]/page.tsx` (Detail — Teams/Teilnehmer)
- `web/src/app/t/[tournamentId]/board/page.tsx` falls dort `game.team_size` genutzt wird

`games.team_size` bleibt als Katalog-Default bestehen.

## Features

### 1. Turnier anlegen (`/organizer/tournaments/new`)
Formular (rhf + zod): **Name** (Pflicht), **Spiel** (Dropdown aus `games`, Pflicht), **Format** (5 Optionen, Pflicht), **Modus** (lan/online/hybrid, Default hybrid), **Teamgröße** (Zahl ≥ 1, Default = `team_size` des gewählten Spiels, beim Spielwechsel aktualisiert), **Start** (Datum/Zeit, optional). Server Action `createTournament` → Insert mit `status='draft'`, `created_by = auth.uid()`. Danach Redirect auf die Übersicht.

### 2. Turnier-Übersicht / Bearbeiten / Status / Löschen (`/organizer/tournaments/[id]`)
- **Fakten**: Name, Spiel, Format, Modus, Teamgröße, Start, Status, Teilnehmerzahl.
- **Bearbeiten** (`updateTournament`): Name, Modus, Teamgröße, Start immer; **Spiel + Format nur solange kein Bracket existiert** (sonst wäre der generierte Baum inkonsistent) — UI sperrt die Felder + Server prüft es.
- **Status-Lifecycle (geführt)**, je ein Button für den erlaubten nächsten Schritt:
  - `draft → registration` („Anmeldung öffnen") — `openRegistration`.
  - `registration → running`: **kein eigener Button** — passiert durch die bestehende Bracket-Generierung (setzt schon `running`). Übersicht zeigt den Hinweis „Zum Starten Bracket generieren".
  - `running → finished` („Turnier beenden") — `finishTournament`.
  - Rückschritte sind nicht vorgesehen (geführt, keine Rückwege).
- **Löschen** (`deleteTournament`, mit Bestätigungsdialog) — Cascade entfernt Matches/Teilnehmer (FKs `on delete cascade`).

### 3. Spiele-Verwaltung (`/organizer/games`)
Liste aller `games` + Formular zum **Anlegen** (Name, Team-Größe) und **Bearbeiten**. **Löschen nur, wenn kein Turnier das Spiel referenziert** (Server prüft per Count; sonst Fehlermeldung „Spiel wird von N Turnieren genutzt"). Actions: `createGame`, `updateGame`, `deleteGame`.

### 4. Teilnehmer-Detail (`/organizer/tournaments/[id]/participants/[pid]`)
- **Anzeige**: Anzeigename, Gamertag, Geburtsdatum, Typ (solo/team), Einwilligung (vorhanden?), Check-in-Status, **QR-Code** (aus `participants.qr_token`, gerendert wie auf der Check-in-Station via `qrcode.react`).
- **Bearbeiten** (`updateParticipant`): Anzeigename + Gamertag.
- **Entfernen** (`removeParticipant`, mit Bestätigung) — löscht den Teilnehmer (Cascade auf `team_members`/`consents`; `match_reports`/`matches` referenzieren `on delete set null`).
- Verlinkt von der bestehenden Teilnehmer-Liste (`participants/page.tsx`).

### 5. Security-Härtung
Siehe Datenmodell — die Migration ersetzt die permissiven Write-Policies durch `is_staff()`.

## Pure Logic (TDD)
`web/src/lib/tournament/lifecycle.ts`:
- `nextStatus(current)` → der erlaubte nächste Status (`draft→registration`, `running→finished`) oder `null`.
- `canEditStructure(status, hasMatches)` → darf Spiel/Format geändert werden (nur ohne Matches).
- `teamLabel(teamSize)` → „1v1"/„5v5"/„Solo"-Anzeige (zentralisiert die heute verstreute `NvN`-Logik).

## Fehlerbehandlung
Alle Server Actions: `requireStaff`-Guard (nicht-Staff → Fehlerstring), `friendlyDbError` für DB-Fehler, deutsche Meldungen, `ActionResult = {ok:true}|{error}`. Validierung an der Grenze (zod) + serverseitig (z.B. Format-Änderung bei vorhandenem Bracket abweisen). Lösch-/Statusaktionen mit Bestätigungs-UI.

## Tests
- **Unit (Vitest, TDD):** `lifecycle.ts` (Übergänge, Edit-Guard, teamLabel).
- **Integration:** Server Actions bleiben staff-gated (bestehendes Muster, durch e2e abgedeckt).
- **e2e (Playwright):** Organizer legt Turnier an → Übersicht zeigt Fakten → „Anmeldung öffnen" → `/register` ist jetzt erreichbar (Spieler meldet sich an) → Teilnehmer-Detail zeigt ihn → entfernen. Spiele: anlegen + in der Turnier-Anlage auswählbar.

## Done = alle wahr
Migration (team_size + RLS-Härtung) angewandt; Organizer kann via UI ein Turnier anlegen (inkl. wählbarer Teamgröße), bearbeiten, Anmeldung öffnen, beenden, löschen; Spiele verwalten; Teilnehmer ansehen/bearbeiten/entfernen + QR sehen; anon-Spieler können Turniere/Spiele **nicht** mehr schreiben; `game.team_size`-Lesestellen nutzen `tournament.team_size`; lifecycle-Helper unit-getestet; build + unit + e2e grün.
