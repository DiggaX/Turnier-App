# Turnier-App — Übergabe an den nächsten Agent

**Stand:** 2026-08-07 · Branch `main` @ `c1e7b95` · **auf `origin/main` gepusht** (`github.com/DiggaX/Turnier-App`) · live unter https://turnier-app-opal.vercel.app

Lies zuerst diese Datei, dann `CLAUDE.md` (Regeln) und die Auto-Memory unter
`C:\Users\Rene\.claude\projects\C--Users-Rene-Turnierapp\memory\` (MEMORY.md + die verlinkten Dateien).

---

## 1. Was die App ist
Ein **Multi-Tenant-Esports-Turnier-SaaS**. Firmen (Organisationen) registrieren sich selbst, laden Mitglieder ein, legen Turniere in 5 Formaten an. Spieler melden sich mobil an (anonyme Auth, mit Eltern-Einwilligung für Minderjährige), checken per QR ein, tragen Ergebnisse ein (Schiri bestätigt), verfolgen ein Live-Board. Jede Firma hat ihren isolierten Bereich unter `/o/<slug>`.

## 2. Stack
- **Frontend/Backend:** Next.js **16.2.9** (App Router) im Unterordner **`web/`**. Vercel Root Directory = `web`. ⚠️ Next 16 hat Breaking Changes ggü. Trainingsdaten: async `params`/`searchParams`/`cookies()`/`headers()`, Middleware heißt `proxy.ts`, Turbopack-Build. **Vor Next-Code: `web/node_modules/next/dist/docs/` lesen** (steht auch in `web/AGENTS.md`).
- **DB/Auth:** Supabase (Postgres + RLS + Anonymous Auth + Storage + Realtime). Projekt-Ref **`zqhdbygopftretjtlods`**.
- **UI:** Tailwind v4 + shadcn/ui (button/badge/card/checkbox/input/label/table — **kein Select**, nutze native `<select>`). Dark-Esports-Design: BG `#07090c`, surface `#10141c`, lime `#c5f72e`, cyan `#1fd1e3`, live-red `#ff3b5c`; Fonts Space Grotesk (variabel) + Chakra Petch.
- **Forms:** react-hook-form + zod. **Tests:** Vitest (**298** Unit-Tests grün) + Playwright (e2e geschrieben, s.u.).

## 3. Deploy & DB — WIE (wichtig!)
- **Deploy: manuell per Vercel CLI** vom Repo-Root: `vercel deploy --prod --yes` (eingeloggt als `moellersrene-3676`, Root Directory = `web`). Kein Auto-Deploy bei Push. **GitHub-Push ist OK und erwünscht** (Account nicht mit Vercel verbunden). ⚠️ **Brain (Obsidian `Zweites-Gehiern`) NIE pushen** — nur lokales Git, kein Remote.
- **Migrationen: über den `supabase-db2` MCP** (`mcp__supabase-db2__apply_migration` / `execute_sql`). Read-write, zeigt auf `zqhdbygopftretjtlods`. **Workflow:** Migrations-`.sql` schreiben → `apply_migration` → mit `execute_sql` verifizieren → Datei committen. Der **primäre** Supabase-MCP (`mcp__1830aac2…`) gehört einem ANDEREN Account und kann das Projekt NICHT lesen — **immer db2 nehmen**.
- RLS simulieren: `begin; set local role authenticated; set local "request.jwt.claims" to '{"sub":"<uuid>","role":"authenticated"}'; <query>; rollback;`
- ⚠️ **Vercel „Shared" Env-Vars (Team-Ebene) wirken NICHT automatisch im Projekt** — sie müssen dem Projekt zugeordnet werden, und `vercel env ls` zeigt sie gar nicht an. Genau daran hing die Geräte-Kopplung: Key war gesetzt, kam aber nie an. Wenn eine Env-Variable „fehlt", obwohl der User sie gesetzt hat: das prüfen. Env-Änderungen brauchen außerdem ein **neues Deployment**.

## 4. Arbeitsweise (etabliert, beibehalten)
Plan-für-Plan: **brainstorming → writing-plans → Ausführung**. Ausführung via **Workflow-Tool** nur unter Ultracode/explizitem Opt-in; sonst subagent-driven-development. TDD für pure Logik. Kritische/Security-Migrationen wende ICH (Controller) per db2 an + beweise die Guards.
- **Commits:** **NIE** `Co-Authored-By`-Trailer (CLAUDE.md). `git add <konkrete Dateien>`, nie `git add -A`.
- **Nie committen:** `.claude/`, `.mcp.json`, `CLAUDE.md`, `skills-lock.json` (Tooling, absichtlich untracked).
- ⚠️ **Workflow-Agents erzeugen manchmal Müll-Dateien im Root**. Nach jedem Workflow `git status` prüfen.
- ⚠️ **Dev-Server (Turbopack) hängt nach Modul-Umbenennungen auf altem Graph** und meldet Import-Fehler, die es nicht mehr gibt → Preview neu starten. `npm run build` ist die Wahrheit.

## 5. Was fertig + LIVE ist
- **MVP:** Registrierung + Einwilligung, QR-Check-in + Check-in-Station, Organizer-Dashboard, Single-Elim + Round-Robin, Ergebnis-Flow (report_match → confirm_match), Live-Board.
- **Phase 2 Formate:** Double-Elimination, Swiss-System, Gruppen→Playoffs, Web-Push, Ergebnis-Stationen (Kiosk).
- **Organizer-Admin:** Turnier-CRUD, geführter Status-Lifecycle, Spiele-Verwaltung, Teilnehmer-Detail, Teamgröße pro Turnier.
- **Multi-Tenancy:** Organisationen + strikte Isolation + Self-Service-Signup/Invites/Mitglieder.
- **Live-Scorekeeper:** Token-Link `/score/<token>` pro Match (start → live-Score → beenden → Organizer gibt frei).

### Neu am 2026-08-07 (dieser Session)
- **Turnier-Archiv** (`archived_at`): blendet aus Organizer-Liste + öffentlicher Org-Seite aus, `/t/<id>` + Board bleiben erreichbar. Archiv-Ansicht `/organizer?archiv=1`. **Löschen** ist jetzt für `finished` erlaubt, gesperrt nur noch `running`.
- **Org-Name editierbar** unter Nav-Punkt **„Organisation"** (Route bleibt `/organizer/members`). Slug bleibt bewusst stehen.
- **Geräte-Kopplung per QR:** angemeldeter Bildschirm erzeugt QR → Handy scannt → eigene Session, ohne Mail. Plus Geräteliste mit gezieltem Trennen.
- **Check-in-Scanner:** Fehleranzeige, Kamera-Auswahl, Zoom-Regler, „schon anwesend"-Erkennung mit eigenem Ton, **Hardware-Scanner-Unterstützung** (Zebra TC26 via DataWedge), Diagnose-Panel.
- **Anwesenheit zurücksetzbar** in der Check-in-Liste (`resetCheckIn`).
- **Mobil nutzbar:** Organizer-Nav klappt zusammen, Touch-Größen, kein Querscroll mehr.

**Aktueller Datenstand:** DB wurde am 2026-08-07 komplett geleert und neu befüllt. Org **„Abenteuerinsel Fehmarn"** (slug bleibt `testverein-fehmarn`). Admins: `organizer@test.de` / `test1234` (nur Passwort-Login) und `rene.moellers@gmx.de` (Magic Link). Turniere: „Misson: Next Level EA Sports 2026" (Anmeldung offen), „Misson: Next Level Rocket League 2026" (Entwurf), „Sommer Cup 2026" (archiviert).

## 6. Architektur-Kernpunkte (NICHT übersehen)
- **Multi-Tenant-Isolation:** `profiles.org_id` + `tournaments.org_id` + `public.current_org_id()` (SECURITY DEFINER). Staff-Write-RLS ist `is_staff() AND <org = current_org_id()>`. **Turnier-SELECT bleibt public**. `games` bleiben **global**. Organizer-Seiten 404'en fremde Turniere via `requireOrgTournament`.
- **⚠️ SECURITY-DEFINER-RPCs umgehen RLS** → brauchen EXPLIZITE Guards. Neue schreibende Definer-RPCs: **immer `is_staff()`/`is_admin()` UND Org-Check**. Bei `my_sessions()`/`revoke_session()` ist die `auth.uid()`-Bedingung die Autorisierung — nicht entfernen.
- **PII-Modell:** `anon` hat nur Spalten-GRANT auf `participants(id, tournament_id, display_name)`. Öffentliche Seiten lesen über **`createPublicClient()`**.
- ⚠️ **`createPublicClient()` ist `async` und ruft `await connection()`.** Jede öffentliche Seite MUSS `await createPublicClient()` schreiben. Ohne das friert Next die Seite beim Build ein und Produktion zeigt den Datenstand vom letzten Deploy (genau dieser Bug war live).
- ⚠️ **Datum/Zeit immer über `@/lib/format-date`**, nie roh `toLocaleString`. Ohne fixe Zeitzone rendert der Server in UTC (Vercel) → Zeiten 2 h falsch, und in Client-Komponenten bricht React die Hydration ab (#418), wodurch die Komponente **keine Klick-Handler** mehr anhängt. Genau so war „Handy verbinden" auf Prod tot, während es lokal lief.
- **Auth-Flows:** `/auth/confirm` behandelt **beides** — `?code=` (PKCE, Standard bei `@supabase/ssr`, Tokens tragen Präfix `pkce_`) und `?token_hash=` (admin-generiert, für Geräte-Kopplung). PKCE ist an den anfordernden Browser gebunden → normale Magic Links funktionieren **nicht cross-device**. Für cross-device müsste das Supabase-Mail-Template auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` umgestellt werden; der Code kann beides.
- **Magic Link legt keine Konten an** (`shouldCreateUser: false`) — sonst entstehen Waisen-Accounts ohne Profil, die sich einloggen und kommentarlos aus `/organizer` fliegen.
- **Geräte-Kopplung:** Tabelle `device_pairings` hat **RLS an und absichtlich KEINE Policies** → nur per Service-Role erreichbar. Token: 32 Byte, 2 Min, nur sha256 gespeichert, Einlösung per **einem** bedingten UPDATE (select-dann-update ließe zwei Scans durch). Braucht `SUPABASE_SERVICE_ROLE_KEY` (siehe §3).
- ⚠️ **`auth.sessions.user_agent` ist bei serverseitigem Auth immer `"node"`**, die IP die des Servers. Als Gerätename unbrauchbar — der echte User-Agent wird bei der Kopplung selbst mitgeschrieben und über `session_id` (aus dem JWT-Claim) an die Session gehängt.
- **Handscanner ≠ Kamera:** Das Zebra TC26 scannt mit einem SE4100-Laser-Imager, der **nie** in `getUserMedia` auftaucht. Zebras DataWedge liefert Scans als Tastatureingaben mit Enter → `web/src/lib/hardware-scan.ts` trennt Maschinen-Bursts (≤60 ms zwischen Zeichen) von Tippen. DataWedge-Einstellung: Profile0 → Barcode Input + Keystroke Output + „Send Characters as Events" + „Send ENTER key".
- **Touch-Größen** liegen zentral in `globals.css` unter `@media (pointer: coarse)` — nicht in Einzelkomponenten duplizieren.
- **Generatoren** sind pure TS (TDD): `web/src/lib/bracket/*`, `swiss/*`, `groups/*`. Swiss/Gruppen werden runde-für-runde fortgeschrieben.

## 7. OFFEN / To-do (für dich)
1. **e2e nie ausgeführt:** ~20 Specs in `web/e2e/*.spec.ts` sind geschrieben, aber nur build+unit-grün. Brauchen lokalen Dev-Server + Test-Creds (`E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD`). ⚠️ Nach dem DB-Wipe zeigen sie ggf. auf nicht mehr existierende Fixtures. Kein aktives e2e-Sicherheitsnetz.
2. **Cross-Device-Magic-Link** offen (Template-Umstellung, siehe §6) — User weiß Bescheid, hat sich noch nicht entschieden.
3. **36 verwaiste Storage-Objekte** aus der Zeit vor dem Wipe. Per SQL nicht löschbar (Supabase blockt), nur über Dashboard/Storage-API.
4. **Push** nie auf echtem Gerät getestet (VAPID-Keys sind gesetzt).
5. **Datei-Hygiene:** zwei Migrationen teilen den Timestamp `20260628090000`. Live-DB korrekt, nur Datei-Kollision; bei Gelegenheit umbenennen (NICHT neu anwenden).
6. **Geleakter `sb_secret_…`-Key** sollte rotiert werden (User mehrfach erinnert).
7. **Nächste Feature-Idee** (Memory `turnier-app-live-score-capture`): Live-Score-Auto-Capture von Laptops (CS2 GSI / Valorant API / OCR) → Realtime-Board.
8. **Wettbewerbs-Lücken** (Memory `turnier-app-competitor-tournify`): Auto-Scheduler + Präsentationsmodus.

## 8. Datei-Landkarte
- `web/src/app/` — Routen. Öffentlich: `page.tsx`, `o/[slug]/`, `t/[tournamentId]/{,register,me,board,checkin-station}`. Auth: `(auth)/login`, `(auth)/signup`, `auth/confirm/route.ts`, `link/[token]/route.ts` (Geräte-Kopplung). Organizer: `organizer/`, `games`, `members` (Org-Name + Geräte + Mitglieder), `tournaments/[id]/{,bracket,matches,participants,checkin,station}`. Scorekeeper: `score/[token]/`.
- `web/src/lib/` — `bracket/`, `swiss/`, `groups/`, `standings.ts`, `tournament/lifecycle.ts`, `org/`, `auth/{staff,org-tournament,device-pairing,device-label}.ts`, `supabase/{server,client,public,admin}.ts`, `format-date.ts`, `hardware-scan.ts`, `scan-feedback.ts`, `push/`, `station/`, `db-errors.ts`, `database.types.ts`.
- `supabase/migrations/` — alle live angewandt. Neu: `20260807170000_tournament_archive.sql`, `20260807200000_device_pairing.sql`.
- `docs/superpowers/{specs,plans}/` — Designs + Pläne. `docs/DEPLOY.md` — Deploy/Setup-Notizen.
- Brain (Obsidian, NICHT im Repo): `C:\Users\Rene\Documents\Zweites-Gehirn\02 Projekte\Turnier-App\`.

## 9. Erste Schritte für dich
1. `git -C C:\Users\Rene\Turnierapp log --oneline -10`, `git status`.
2. db2-Verbindung testen: `mcp__supabase-db2__list_tables` (~15 Tabellen erwartet). Bei „Unauthorized" → User muss `SUPABASE_ACCESS_TOKEN_DB2` setzen + Claude Code neu starten.
3. `cd web && npm run build && npm test` (**298** grün erwartet).
4. Mit dem User klären, was ansteht. Vor Feature-Bau: **brainstorming-Skill**.

## 10. Was in dieser Session teuer war (Zeit sparen)
Fünf Bugs waren **unsichtbar statt laut** — die Symptome zeigten nie auf die Ursache:
- „Startseite zeigt alte Daten" → in Wahrheit Build-Time-Prerender (§6).
- „Magic Link geht nicht" → Route warf den fertig verifizierten PKCE-Code weg, und die Login-Seite zeigte den Fehler-Parameter gar nicht an.
- „Button tut nichts" → Hydration-Abbruch wegen Zeitzone (§6).
- „Scanner geht nicht" → `onError` fehlte, jeder Kamerafehler wurde stumm verschluckt.
- „Kamera findet die Scan-Linse nicht" → es war nie eine Kamera, sondern ein Laser-Imager (§6).

**Muster:** Wenn der User sagt „passiert nichts", zuerst prüfen, ob ein Fehlerpfad überhaupt **angezeigt** wird. Und: lokal-läuft-aber-prod-nicht war zweimal ein Zeitzonen- bzw. Umgebungsunterschied, nicht der Code.
