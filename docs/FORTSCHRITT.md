# Turnier-App — Fortschritt

**Letzter Stand:** 2026-06-19 · Branch `main` @ `cd19253` · auf `origin/main` gepusht (`github.com/DiggaX/Turnier-App`)

---

## Fertig & Live

| Bereich | Status |
|---------|--------|
| MVP (Register, QR-Check-in, Brackets, Live-Board) | ✅ live |
| Organizer-Admin Modul 1 (CRUD, Lifecycle, Teilnehmer) | ✅ live |
| Formate Phase 2 (Double-Elim, Swiss, Gruppen→Playoffs) | ✅ live |
| Multi-Tenancy Modul 2a (Org-Isolation, RLS) | ✅ live |
| Multi-Tenancy Modul 2b (Signup, Invites, Mitglieder) | ✅ live |
| Security-Fix: participant PII / qr_token Read-Leak | ✅ live |
| 226 Unit-Tests grün | ✅ |
| Supabase „Confirm email" AUS (Signup-Blocker weg) | ✅ 2026-06-18 |
| `sb_secret_…`-Key rotiert | ✅ 2026-06-18 |
| e2e-Suite 20/20 grün (12 Specs gefixt) | ✅ 2026-06-18 |
| Migrations-Timestamp-Kollision behoben | ✅ 2026-06-18 |
| Code-Review (xhigh): 9 Findings gefixt + e2e-Helper in `fixtures.ts` extrahiert | ✅ 2026-06-19 |
| Security-Review: 4 Cross-Org-PII-Lecks geschlossen (Migration `20260702090000`, mit simulierten Rollen bewiesen) | ✅ 2026-06-19 |

---

## Offen

| # | Aufgabe | Priorität | Notizen |
|---|---------|-----------|---------|
| 2 | e2e-Tests ausführen | ✅ **fertig** | **20/20 grün.** 12 Specs gefixt, 0 App-Bugs. Detail unten. |
| 3 | Web-Push auf echtem Gerät testen | 🟡 | VAPID-Keys gesetzt, braucht HTTPS + iOS Home-Screen |
| 4 | Live-Acceptance-Test End-to-End (User) | 🟡 **bereit** | Deployment health-checked ✅, Sommer Cup zurückgesetzt (sauber, `registration`), Checkliste in [ACCEPTANCE.md](ACCEPTANCE.md) — User-Durchlauf steht aus |
| 7 | Live-Score-Capture Feature | 🔵 Next Feature | CS2 GSI / Valorant API / OCR → Realtime-Board; Memory `turnier-app-live-score-capture` |

---

## e2e-Status (2026-06-18 / 19)

Alle Specs gegen **localhost:3000 + LIVE-Supabase** (kein Test-DB). **20/20 grün.** 12 Specs gefixt/refactored — **alle Fehler waren veraltete Tests oder Test-Bugs, KEIN einziger App-Bug.**

**Grün (20):** home, learn, multi-tenant, tournament-detail*, login, organizer-participants*, organizer-checkin*, organizer-admin*, double-elim*, swiss*, result-station, register-solo, register-minor, checkin-online, checkin-station, bracket-generate†, live-board†, results-flow†, groups-playoffs*, signup* (`*`=gefixt, `†`=auf Wegwerf-Fixture umgebaut).

`signup`-Fix: `auth.admin.getUserByEmail` existiert in supabase-js v2 nicht → Cleanup-User-ID über DB (Org-Name unique → Admin-Profil). Braucht `SUPABASE_SERVICE_ROLE_KEY` (legacy service_role) in `web/.env.local` — gesetzt, Spec läuft grün.

**Lehre (Flakiness-Quellen, kein Code-Bug):** (1) Anon-Sign-in-Limit per-IP — anon-schwere Specs (groups=8-Burst) einzeln/gespaced laufen, nicht alle 20 zusammen. (2) Cold-Compile — nach Server-Idle braucht erster Bracket-Page-Hit >30s Turbopack-Recompile → Test-Timeout. Vor anon-schweren Läufen Server warm halten (Heavy-Routes vorab curlen).

**Fix-Ursachen (alle veraltete Tests / Test-Bugs):**
- `tournament-detail`, `organizer-participants`, `organizer-checkin`: Multi-Tenant/Modul-1-Nav (Tournament-Listing Home→`/o/<slug>`, Dashboard→Übersicht-Tab).
- `organizer-admin`: Race — `toHaveURL(/tournaments/[^/]+$/)` matcht `/tournaments/new` vor Redirect → `id="new"` → `/t/new/register` 404 + echtes Turnier leakte. Fix: UUID-strikte Regex.
- `double-elim`, `swiss`, `groups-playoffs`, `result-station`: Fixture-Insert ohne `org_id` → Multi-Tenant-2a Write-RLS blockt. Fix: org_id aus Profil.
- `swiss`/`groups`: brittle Selectors (`getByText('Tabelle'/'Playoffs')` Substring-Kollision) → `{exact:true}`.
- `bracket-generate`/`live-board`/`results-flow`: waren destruktiv gg. Sommer Cup → auf eigene Wegwerf-Fixtures umgebaut (Multi-Agent-Workflow).

**Code-Review-Härtung (2026-06-19):** xhigh Multi-Agent-Review (10 Finder → Verify → Sweep) → 9 Test-Qualitäts-Findings gefixt (alle Test-seitig, **kein App-Bug**): signup-Cleanup leak-fest (Org-Name-Auflösung in afterAll, läuft auch bei Pre-Redirect-Flake); results-flow prüft echten /me-Report-Flow (ein Spieler Formular, einer RPC) + Sieger==Seite-A statt „einer von beiden"; live-board prüft Namen unbedingt (Gate raus) + aus Registrierung abgeleitet; tournament-detail `url.pathname` statt unescaped Slug-RegExp; tote side/score-Leiter weg; bracket-generate Bye-Kommentar korrigiert. Doppelte Fixture-Helper → `web/e2e/fixtures.ts` zentralisiert (−718 Zeilen netto). `playwright --list` kompiliert alle 20; 8 Specs live grün re-verifiziert.

**DB-Hygiene erledigt:** insg. ~160 E2E-Teilnehmer-Leichen + ~300 verwaiste anon-Users gelöscht, 0 Leftover-Fixtures/-Orgs. **Sommer Cup 2026 komplett zurückgesetzt** (alle Test-/Debug-Teilnehmer + Bracket weg, Status `registration`) — bereit für Acceptance-Test. **Offen:** 35 Signatur-Objekte im `consent-signatures`-Storage (per SQL nicht löschbar — „Use Storage API"; via Supabase-Dashboard/Service-Role wegräumen).

## Security-Härtung (2026-06-19)

Tiefen-Audit Multi-Tenant-Isolation + Token (auf User-Wunsch). **Token-Enumeration nicht möglich** — `qr_token` (`gen_random_uuid()`) + Invite-`code` (`crypto.randomUUID()`) sind zufällige UUIDs. **4 Cross-Org-PII-Lecks gefunden + geschlossen:** mehrere SELECT-Policies (`consents`, `team_members`, `check_ins`, `match_reports`, `push_subscriptions`), der `check_in`-qr_scan-RPC und die consent-signatures-Storage-Policy nutzten nacktes `is_staff()` (org-agnostisch). Migration `20260702090000_org_scope_staff_reads.sql` führt `is_staff_of_participant_org()` ein + scopt alle Staff-Branches auf `current_org_id()`. Live angewandt (per db2) + mit simulierten Rollen bewiesen (own sichtbar, fremde Org = 0). Nicht betroffen (korrekt isoliert): Turnier-/Match-/Teilnehmer-Writes, profiles, organizations, org_invites, confirm_match, report_match, member-RPCs, qr_token/PII-Reads. Offen optional: Leaked-Password-Protection (Dashboard-Toggle).

## Nächster Schritt

**e2e komplett abgeschlossen — 20/20 grün + Code-Review-gehärtet.** Klein-Rest:
1. 35 verwaiste Signatur-Objekte im `consent-signatures`-Storage via Dashboard/Service-Role löschen (SQL-Delete blockiert).
2. Offene Punkte: **#4** Live-Acceptance-Durchlauf (User, [ACCEPTANCE.md](ACCEPTANCE.md), Sommer Cup ist sauber), **#3** Push-Gerätetest, **#7** Live-Score-Capture.
