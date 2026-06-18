# Turnier-App — Fortschritt

**Letzter Stand:** 2026-06-18 · Branch `main` @ `369ed81` · 103 Commits lokal, NICHT gepusht

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

---

## Offen

| # | Aufgabe | Priorität | Notizen |
|---|---------|-----------|---------|
| 2 | e2e-Tests ausführen | ✅ **fertig** | **20/20 grün.** 12 Specs gefixt, 0 App-Bugs. Detail unten. |
| 3 | Web-Push auf echtem Gerät testen | 🟡 | VAPID-Keys gesetzt, braucht HTTPS + iOS Home-Screen |
| 4 | Live-Acceptance-Test End-to-End (User) | 🟡 **bereit** | Deployment health-checked ✅, Sommer Cup zurückgesetzt (sauber, `registration`), Checkliste in [ACCEPTANCE.md](ACCEPTANCE.md) — User-Durchlauf steht aus |
| 7 | Live-Score-Capture Feature | 🔵 Next Feature | CS2 GSI / Valorant API / OCR → Realtime-Board; Memory `turnier-app-live-score-capture` |

---

## e2e-Status (2026-06-18)

Alle Specs gegen **localhost:3000 + LIVE-Supabase** (kein Test-DB). **20/20 grün.** 12 Specs gefixt/refactored — **alle Fehler waren veraltete Tests oder Test-Bugs, KEIN einziger App-Bug.**

**Grün (20):** home, learn, multi-tenant, tournament-detail*, login, organizer-participants*, organizer-checkin*, organizer-admin*, double-elim*, swiss*, result-station, register-solo, register-minor, checkin-online, checkin-station, bracket-generate†, live-board†, results-flow†, groups-playoffs*, signup* (`*`=gefixt, `†`=auf Wegwerf-Fixture umgebaut).

`signup`-Fix: `auth.admin.getUserByEmail` existiert in supabase-js v2 nicht → Cleanup-User-ID jetzt über DB (Org-Name unique → Admin-Profil). `SUPABASE_SERVICE_ROLE_KEY` (legacy service_role) muss in `web/.env.local` stehen.

**Lehre (Flakiness-Quellen, kein Code-Bug):** (1) Anon-Sign-in-Limit per-IP — anon-schwere Specs (groups=8-Burst) einzeln/gespaced laufen, nicht alle 20 zusammen. (2) Cold-Compile — nach Server-Idle braucht erster Bracket-Page-Hit >30s Turbopack-Recompile → Test-Timeout. Vor anon-schweren Läufen Server warm halten (Heavy-Routes vorab curlen).

**Übersprungen (1):** `signup` — braucht `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (fehlt, rotiert).

**Fix-Ursachen (alle veraltete Tests / Test-Bugs):**
- `tournament-detail`, `organizer-participants`, `organizer-checkin`: Multi-Tenant/Modul-1-Nav (Tournament-Listing Home→`/o/<slug>`, Dashboard→Übersicht-Tab).
- `organizer-admin`: Race — `toHaveURL(/tournaments/[^/]+$/)` matcht `/tournaments/new` vor Redirect → `id="new"` → `/t/new/register` 404 + echtes Turnier leakte. Fix: UUID-strikte Regex.
- `double-elim`, `swiss`, `groups-playoffs`, `result-station`: Fixture-Insert ohne `org_id` → Multi-Tenant-2a Write-RLS blockt. Fix: org_id aus Profil.
- `swiss`/`groups`: brittle Selectors (`getByText('Tabelle'/'Playoffs')` Substring-Kollision) → `{exact:true}`.
- `bracket-generate`/`live-board`/`results-flow`: waren destruktiv gg. Sommer Cup → auf eigene Wegwerf-Fixtures umgebaut (Multi-Agent-Workflow).

**DB-Hygiene erledigt:** 155 E2E-Teilnehmer-Leichen + 283 verwaiste anon-Users gelöscht, 0 Leftover-Fixtures. Behalten: 2 E2E-Teilnehmer im **laufenden** Sommer-Cup-Bracket (Altlast, aber Bracket-referenziert — Sommer Cup bewusst heil gelassen) + 11 referenzierte anon-Users. **Offen:** 35 Signatur-Objekte im `consent-signatures`-Storage (per SQL nicht löschbar — „Use Storage API"; via Supabase-Dashboard/Service-Role wegräumen). Anon-Rate-Limit (per-IP-Token-Bucket, ~stündlich) heute mehrfach ausgeschöpft.

## Nächster Schritt

**e2e komplett abgeschlossen — 20/20 grün.** Klein-Rest:
1. 35 verwaiste Signatur-Objekte im `consent-signatures`-Storage via Dashboard/Service-Role löschen (SQL-Delete blockiert).
2. Zurück zu den restlichen offenen Punkten: Push-Gerätetest (#3), Acceptance-Test (#4), Migrations-Kollision (#5) oder Live-Score-Capture (#7).
