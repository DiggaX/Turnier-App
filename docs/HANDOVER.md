# Turnier-App — Übergabe an den nächsten Agent

**Stand:** 2026-06-19 · Branch `main` @ `cd19253` · **auf `origin/main` gepusht** (`github.com/DiggaX/Turnier-App`) · live unter https://turnier-app-opal.vercel.app

Lies zuerst diese Datei, dann `CLAUDE.md` (Regeln) und die Auto-Memory unter
`C:\Users\Rene\.claude\projects\C--Users-Rene-Turnierapp\memory\` (MEMORY.md + die verlinkten Dateien).

---

## 1. Was die App ist
Ein **Multi-Tenant-Esports-Turnier-SaaS**. Firmen (Organisationen) registrieren sich selbst, laden Mitglieder ein, legen Turniere in 5 Formaten an. Spieler melden sich mobil an (anonyme Auth, mit Eltern-Einwilligung für Minderjährige), checken per QR ein, tragen Ergebnisse ein (Schiri bestätigt), verfolgen ein Live-Board. Jede Firma hat ihren isolierten Bereich unter `/o/<slug>`.

## 2. Stack
- **Frontend/Backend:** Next.js **16.2.9** (App Router) im Unterordner **`web/`**. Vercel Root Directory = `web`. ⚠️ Next 16 hat Breaking Changes ggü. Trainingsdaten: async `params`/`searchParams`/`cookies()`/`headers()`, Middleware heißt `proxy.ts`, Turbopack-Build. **Vor Next-Code: `web/node_modules/next/dist/docs/` lesen** (steht auch in `web/AGENTS.md`).
- **DB/Auth:** Supabase (Postgres + RLS + Anonymous Auth + Storage + Realtime). Projekt-Ref **`zqhdbygopftretjtlods`**.
- **UI:** Tailwind v4 + shadcn/ui (button/badge/card/checkbox/input/label/table — **kein Select**, nutze native `<select>`). Dark-Esports-Design: BG `#07090c`, surface `#10141c`, lime `#c5f72e`, cyan `#1fd1e3`, live-red `#ff3b5c`; Fonts Space Grotesk + Chakra Petch.
- **Forms:** react-hook-form + zod. **Tests:** Vitest (226 Unit-Tests grün) + Playwright (e2e geschrieben, s.u.).

## 3. Deploy & DB — WIE (wichtig!)
- **Deploy: manuell per Vercel CLI** vom Repo-Root: `vercel deploy --prod --yes` (eingeloggt als `moellersrene-3676`, Root Directory = `web`). **GitHub-Push ist OK** (Update 2026-06-19): der GitHub-Account ist NICHT mit Vercel verbunden → ein Push löst KEINEN Auto-Deploy/keine Account-Sperre aus. `git push origin main` nach `github.com/DiggaX/Turnier-App` ist normal + erwünscht; die alte „nicht pushen"-Regel ist überholt. Deploy bleibt trotzdem ein separater, manueller CLI-Schritt (kein Auto-Deploy bei Push). ⚠️ **Brain (Obsidian `Zweites-Gehiern`) NIE pushen** — nur lokales Git, kein Remote.
- **Migrationen: über den `supabase-db2` MCP** (`mcp__supabase-db2__apply_migration` / `execute_sql`). Der db2-MCP zeigt auf `zqhdbygopftretjtlods` und ist read-write (Token via User-Env `SUPABASE_ACCESS_TOKEN_DB2`). **Workflow:** Migrations-`.sql` schreiben → `apply_migration` → mit `execute_sql` + simulierten Rollen verifizieren → Datei committen. Der **primäre** Supabase-MCP (`mcp__1830aac2…`) gehört einem ANDEREN Account (Eventpilotos) und kann das Turnier-Projekt NICHT lesen (`permission denied`) — **immer db2 nehmen**. Details: Memory `turnier-app-supabase-mcps`.
- RLS simulieren (Isolation/Guards beweisen): `begin; set local role authenticated; set local "request.jwt.claims" to '{"sub":"<uuid>","role":"authenticated"}'; <query>; rollback;`

## 4. Arbeitsweise (etabliert, beibehalten)
Plan-für-Plan: **brainstorming → writing-plans → Ausführung**. Ausführung via **Workflow-Tool** (Multi-Agent: pro Task implement → spec-review → quality-review mit Fix-Loops, dann opus-Gesamt-Review) — nur unter Ultracode/explizitem Opt-in; sonst subagent-driven-development (Agent-Tool). TDD für pure Logik. Kritische/Security-Migrationen wende ICH (Controller) per db2 an + beweise die Guards, der Workflow baut nur den Code.
- **Commits:** **NIE** `Co-Authored-By`-Trailer (CLAUDE.md). `git add <konkrete Dateien>`, nie `git add -A`.
- **Nie committen:** `.claude/`, `.mcp.json`, `CLAUDE.md`, `skills-lock.json` (Tooling, absichtlich untracked).
- ⚠️ **Workflow-Agents erzeugen manchmal Müll-Dateien im Root** (Shell-Redirect-Unfälle, z.B. `0`, `false`, `now.getTime()`, `selects`). Nach jedem Workflow `git status` prüfen + Müll löschen, bevor gemergt wird.

## 5. Was fertig + LIVE ist
- **MVP:** Registrierung + Einwilligung (`/t/<id>/register`), QR-Check-in + Check-in-Station, Organizer-Dashboard, Single-Elim + Round-Robin, Ergebnis-Flow (report_match → confirm_match), Live-Board.
- **Phase 2 Formate/Features:** Double-Elimination, Swiss-System, Gruppen→Playoffs, Web-Push, Ergebnis-Stationen (Kiosk).
- **Organizer-Admin (Modul 1):** Turnier-CRUD (`/organizer/tournaments/new`, Übersicht `/organizer/tournaments/[id]`), geführter Status-Lifecycle (Entwurf→[Anmeldung öffnen]→registration→Bracket generieren=running→[beenden]→finished), Spiele-Verwaltung (`/organizer/games`), Teilnehmer-Detail (ansehen/bearbeiten/entfernen/QR), Teamgröße pro Turnier.
- **Multi-Tenancy (Modul 2):** Organisationen + strikte Isolation (2a) + Self-Service-Signup/Invites/Mitglieder (2b). `/signup`, `/o/<slug>`, `/organizer/members`.
- **Security-Fix:** participant PII/`qr_token`-Read-Leak geschlossen.

Bestehende Org: **„Eventpilot"** (slug `eventpilot`), Admin-Account **`test@test.de`** (uid `4a4a26ae-f028-4912-9634-8a1894e0113c`). Live-Turniere: Sommer Cup 2026 + Mission: Next Level.

## 6. Architektur-Kernpunkte (NICHT übersehen)
- **Multi-Tenant-Isolation:** `profiles.org_id` + `tournaments.org_id` + `public.current_org_id()` (SECURITY DEFINER). Staff-Write-RLS ist `is_staff() AND <org = current_org_id()>` auf tournaments/matches/participants/organizations. **Turnier-SELECT bleibt public** (Metadaten sind öffentlich; Isolation ist auf Writes + App-Filter, nicht aufs Verstecken). `games` bleiben **global** (kein org_id). Organizer-Seiten 404'en fremde Turniere via `requireOrgTournament` (`web/src/lib/auth/org-tournament.ts`).
- **⚠️ SECURITY-DEFINER-RPCs umgehen RLS** → brauchen EXPLIZITE Guards. `confirm_match` ist org-gehärtet (`20260630090000`). Wenn du neue Definer-RPCs schreibst, die schreiben: **immer `is_staff()`/`is_admin()` UND Org-Check** rein.
- **PII-Modell:** `anon` hat nur Spalten-GRANT auf `participants(id, tournament_id, display_name)`; `authenticated` hat volle Spalten. `participants_select_public_board` ist auf **`to anon`** beschränkt. Öffentliche Seiten (Home, `/t/<id>`, Board) lesen daher über **`createPublicClient()`** (`web/src/lib/supabase/public.ts`, sessionlos = anon-Rolle) — sonst sähen eingeloggte Spieler 0 Teilnehmer bzw. fremdes PII. Session-Client (`@/lib/supabase/server`) nur für `/me` + Organizer.
- **Auth-Guards:** `requireStaff()` (`web/src/lib/auth/staff.ts`) gibt `{ supabase, orgId }`. `is_admin()` (DB) trennt admin von organizer/referee (nur admin verwaltet Mitglieder). Signup/Invite/Member laufen über die 5 RPCs `bootstrap_org`, `accept_invite`, `peek_invite`, `set_member_role`, `remove_member` (profiles haben KEINE INSERT-Policy + KEINEN Trigger).
- **Generatoren** sind pure TS (TDD): `web/src/lib/bracket/*` (single/double-elim, round-robin) + `web/src/lib/swiss/*` + `web/src/lib/groups/*`. Swiss/Gruppen werden runde-für-runde fortgeschrieben (Server-Actions `advanceSwissRound`/`generatePlayoffs`), nicht alles vorab.

## 7. OFFEN / To-do (für dich)
1. **⚠️ Supabase „Confirm email" muss AUS sein** (Dashboard → Authentication → Email-Provider) damit `/signup` sofort durchläuft. Ist ein Dashboard-Toggle (nicht per db2 setzbar). Wenn AN: nach Signup wartet der Org-Bootstrap auf Mail-Bestätigung → `bootstrap_org` schlägt fehl (kein `auth.uid()`). **Vor dem ersten echten Signup-Test prüfen.**
2. **e2e nie ausgeführt:** ~7 Specs in `web/e2e/*.spec.ts` (double-elim, swiss, groups-playoffs, result-station, organizer-admin, signup) sind geschrieben, aber nur build+unit-grün. Brauchen lokalen Dev-Server + Test-Creds (`E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD` in `web/.env.local`). Kein aktives e2e-Sicherheitsnetz.
3. **Push** nie auf echtem Gerät getestet (braucht VAPID-Keys in Vercel + HTTPS + iOS: Seite zum Home-Bildschirm). VAPID-Keys laut User gesetzt.
4. **Live-Acceptance-Test** des End-to-End-Flows durch den User steht aus.
5. **Datei-Hygiene:** zwei Migrationen teilen den Timestamp `20260628090000` (`fix_participant_read_leak` + `participants_delete_staff`) — Live-DB korrekt, nur Datei-Kollision; bei Gelegenheit eine umbenennen (NICHT neu anwenden).
6. **Geleakter `sb_secret_…`-Key** sollte rotiert werden (User mehrfach erinnert).
7. **Nächste Feature-Idee** (Memory `turnier-app-live-score-capture`): Live-Score-Auto-Capture von Laptops (CS2 GSI / Valorant API / OCR) → Realtime-Board. „Nach 2a/2b" notiert → jetzt dran, falls der User will.

## 8. Datei-Landkarte
- `web/src/app/` — Routen. Öffentlich: `page.tsx` (Landing+Org-Liste), `o/[slug]/` (Org-Turniere), `t/[tournamentId]/` (Detail/register/me/board/checkin-station). Auth: `(auth)/login`, `(auth)/signup`. Organizer: `organizer/`, `organizer/games`, `organizer/members`, `organizer/tournaments/[id]/{,/bracket,matches,participants,checkin,station}`.
- `web/src/lib/` — `bracket/`, `swiss/`, `groups/`, `standings.ts`, `tournament/lifecycle.ts`, `org/{slug,invite}.ts`, `auth/{staff,org-tournament}.ts`, `supabase/{server,client,public}.ts`, `push/`, `station/`, `db-errors.ts`, `database.types.ts`.
- `supabase/migrations/` — 21 Migrationen, alle live angewandt (per db2 ab `organizer_admin`; davor vom User im SQL-Editor).
- `docs/superpowers/{specs,plans}/` — alle Designs + Pläne. `docs/DEPLOY.md` — Deploy/Setup-Notizen pro Plan.
- Brain (Obsidian, NICHT im Repo): `C:\Users\Rene\Documents\Zweites-Gehirn\02 Projekte\Turnier-App\` — nur eigene Dateien anfassen, nie die anderen pending changes des Users.

## 9. Erste Schritte für dich
1. `git -C C:\Users\Rene\Turnierapp log --oneline -10`, `git status`.
2. db2-Verbindung testen: `mcp__supabase-db2__list_tables` (sollte ~12 Tabellen zeigen, kein Auth-Fehler). Wenn „Unauthorized" → User muss `SUPABASE_ACCESS_TOKEN_DB2` setzen + Claude Code neu starten.
3. `cd web && npm run build && npm test` (226 grün erwartet).
4. Mit dem User klären, was ansteht (Testen / e2e / Live-Score-Capture / sonstiges). Vor Feature-Bau: **brainstorming-Skill**.
