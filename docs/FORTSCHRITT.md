# Turnier-App — Fortschritt

**Letzter Stand:** 2026-08-10 · Branch `main` @ `da825f0` · auf `origin/main` gepusht (`github.com/DiggaX/Turnier-App`)

⚠️ **Diese Datei lag zwischen 2026-06-19 und 2026-08-10 brach**, während weitergearbeitet wurde
(Archiv, Geräte-Kopplung, Handscanner, Fotoerlaubnis, Nachmeldung …). Der belastbare Verlauf dieser
Wochen steht in **[HANDOVER.md](HANDOVER.md)**, dort §5 und §7 mit datierten Abschnitten. Hier unten
ist ab „Session 2026-08-10" wieder lückenlos. **Bei Widersprüchen gilt HANDOVER.md.**

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
| Passwort-Reset + Passwort ändern für Orga (`/passwort`, `/passwort/vergessen`) | ✅ 2026-08-10 |
| Supabase-Auth konfiguriert: Resend-SMTP, Recovery-Template cross-device, Anon-Limit 30→200/h | ✅ 2026-08-10 |
| Blockierender „Zugang sichern"-Dialog nach der Anmeldung | ✅ 2026-08-10 |
| Teilnehmer-Link schreibfähig: Check-in + Ergebnis melden vom geteilten Link | ✅ 2026-08-10 |
| 393 Unit-Tests grün (waren 226) | ✅ 2026-08-10 |

---

## Offen

| # | Aufgabe | Priorität | Notizen |
|---|---------|-----------|---------|
| 2 | e2e-Tests ausführen | ✅ **fertig** | **20/20 grün.** 12 Specs gefixt, 0 App-Bugs. Detail unten. |
| 3 | Web-Push auf echtem Gerät testen | 🟡 | VAPID-Keys gesetzt, braucht HTTPS + iOS Home-Screen |
| 4 | Live-Acceptance-Test End-to-End (User) | 🟡 **bereit** | Deployment health-checked ✅, Sommer Cup zurückgesetzt (sauber, `registration`), Checkliste in [ACCEPTANCE.md](ACCEPTANCE.md) — User-Durchlauf steht aus |
| 7 | Live-Score-Capture Feature | 🔵 Next Feature | CS2 GSI / Valorant API / OCR → Realtime-Board; Memory `turnier-app-live-score-capture` |
| 8 | Leaked Password Protection | ⛔ **blockiert** | Pro-Plan-Feature, Projekt läuft auf Free. Advisor meldet es weiter — Plan-Grenze, kein Versäumnis. Nicht nochmal recherchieren. |
| 9 | Abgelaufenes Recovery-Fenster meldet irreführend | 🟡 | `pw_recovery` läuft nach 15 min ab; danach fragt `/passwort` nach dem **alten** Passwort, das der Nutzer gerade nicht weiß. Rauskommen geht (neuer Link), aber die Meldung sagt es nicht. User hat es vertagt. |
| 10 | Magic-Link-Template weiter PKCE | 🟡 | Nur *Reset Password* wurde auf `token_hash` umgestellt. Magic Link bleibt an den anfordernden Browser gebunden — bewusst offen gelassen. |
| 11 | `consent-step.tsx` doppelter Accessible-Name | 🟢 klein | `aria-label` + umschließendes `<Label>` ergibt gestotterte Screenreader-Ansage. Im neuen Dialog behoben, hier nicht. |
| 12 | 🚨 Drei Auth-Schalter dürfen NICHT an | ⛔ **Dauerhinweis** | „Require current password when updating", „Secure password change", „Enable Captcha protection". Details HANDOVER §7 Punkt 12 — Captcha würde **jede Teilnehmer-Anmeldung** killen. |

---

## Session 2026-08-10 — Auth & Teilnehmer-Zugang

Vollständiges Protokoll in **[HANDOVER.md §11](HANDOVER.md)**. Kurzfassung:

**Was gemacht wurde.** Drei Themen, alle an derselben Frage: *wie kommt jemand wieder rein, der sein
Gerät nicht mehr hat.*
1. **Passwort-Reset** für Orga (`6e3e21c`) — gab es vorher gar nicht. Eine Seite für beide Fälle,
   Unterscheidung über ein 15-Minuten-Cookie, das `/auth/confirm` bei `type=recovery` setzt.
2. **Zugang-sichern-Dialog** (`3a324b5`, eingehängt mit `0f8d0fd`) — blockierend, Häkchen nötig.
3. **Teilnehmer-Link schreibfähig** (`015b759` + Migration `20260810140000`) — Check-in und Melden
   über den `qr_token`, weil einem zweiten Gerät keine Session zu verschaffen ist.
4. **Supabase-Dashboard** — Resend-SMTP, Recovery-Template, Anon-Rate-Limit 30→200/h.

**Wie vorgegangen.** Erst Bestand lesen (ergab: zwei der drei Wünsche existierten halb), dann
Plan-Modus mit zwei parallelen Explore-Agents, dann vier Entscheidungen dem User vorgelegt, dann
gebaut. Verifiziert wurde nicht durch Behauptung, sondern durch: **Rollback-Transaktion** für die
Schreibpfade (`do $$ … raise exception 'PROBE …' $$`), **Resend-Log** für den Mailversand, **fremder
Browser** für Cross-Device.

**Was gut war.** Erst lesen statt bauen — die Erkenntnis „gibt es schon, nur read-only" hat doppelte
Arbeit verhindert. Rückfragen genau an den Risikoentscheidungen. Fremde, unfertige Arbeit im
Arbeitsbaum **nicht** mitcommittet, sondern die eigenen Dateien isoliert und deren Importe gegen den
Index aufgelöst.

**Was schlecht war.** ⚠️ **Drei Annahmen landeten ungeprüft in Plänen und Dokumenten**, alle drei
fielen beim ersten Hinsehen um: Leak-Schutz sei „ein Klick" (ist Pro-Plan), `pkce_` schließe
Cross-Device aus (gilt nur für `exchangeCodeForSession`), `git add` erzeuge die Müll-Dateien (kann es
gar nicht). Zwei davon standen als Empfehlung im Dokument, bevor sie geprüft waren. Dazu: zu spät
gesagt, welche Dashboard-Schritte ich gar nicht ausführen darf (Konto-Login, API-Keys).

**Was als Nächstes ansteht.** Punkte 9–11 oben sind kleine, klar umrissene Handgriffe. Punkt 12 ist
kein Task, sondern ein Verbot. Punkt 4 (Live-Acceptance) und 3 (Push-Gerätetest) liegen unverändert.

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

**Stand 2026-08-10.** Auth-Kette ist geschlossen und in Produktion bewiesen; die Teilnehmer kommen
jetzt auch von einem zweiten Gerät an alles Nötige.

1. **Kleine Handgriffe:** #9 (irreführende Meldung nach abgelaufenem Recovery-Fenster), #11
   (doppelter Accessible-Name in `consent-step.tsx`).
2. **Vom User zu entscheiden:** #10 (Magic-Link ebenfalls cross-device?), #8 (Pro-Plan wegen
   Leak-Schutz — reine Kostenfrage).
3. **Liegt unverändert:** #4 Live-Acceptance-Durchlauf ([ACCEPTANCE.md](ACCEPTANCE.md)), #3
   Push-Gerätetest, #7 Live-Score-Capture, sowie die 35 verwaisten Signatur-Objekte im
   `consent-signatures`-Storage (SQL-Delete blockiert, nur über Dashboard/Storage-API).
4. ⚠️ **Vor jedem Anfassen der Auth-Einstellungen:** #12 lesen. Drei Schalter sehen dort nach
   Verbesserung aus und würden je einen Teil der App abschalten.
