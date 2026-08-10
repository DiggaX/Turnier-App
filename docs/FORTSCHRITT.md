# Turnier-App — Fortschritt

**Letzter Stand:** 2026-08-10 · Branch `main` @ `07a37b4` · gepusht und deployt
(`turnier-app-opal.vercel.app`; Push auf `main` deployt automatisch, siehe HANDOVER §3)

> Zwei Sitzungen liefen an diesem Tag **parallel** im selben Arbeitsbaum: Auth/Teilnehmer-Zugang
> (`6e3e21c`…`015b759`, `b47a4b1`) und Nachmeldung/Live-Steuerung (`5e4c211`…`e634f7d`). Die
> Commits liegen deshalb verzahnt in der Historie — beim Lesen der Reihenfolge nicht irritieren
> lassen.

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
| Nachmeldung ins laufende Turnier (Orga legt Walk-in an + checkt ein) | ✅ 2026-08-10 · vom User live bestätigt |
| Aufstellung wird bei Team-Turnieren mit abgefragt (Captain + Spieler) | ✅ 2026-08-10 · Browser-Klick steht aus |
| Match starten/zählen/beenden aus der Orga-Ansicht, ohne Scorekeeper | ✅ 2026-08-10 |
| Riegel: „Bracket neu generieren" löscht keine Arbeit mehr unbemerkt | ✅ 2026-08-10 · vom User live bestätigt |
| Geburtsdatum: `validBirthdate()` in beiden Pfaden + CHECK auf `participants.birthdate` | ✅ live 2026-08-10 |
| Checkbox der Fotoerlaubnis wird vom eigenen Wortlaut benannt (a11y) | ✅ live 2026-08-10 |
| Geburtsdatum wird getippt (TT/MM/JJJJ) statt im Kalender gesucht — beide Formulare | ✅ 2026-08-10 · im Browser durchgetippt |
| 405 Unit-Tests grün (waren 226) | ✅ 2026-08-10 |

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
| 11 | `consent-step.tsx` doppelter Accessible-Name | ✅ **fertig** | `aria-label` entfernt (2026-08-10); das umschließende `<Label>` benennt die Checkbox allein, angesagt wird der Wortlaut der Fotoerlaubnis selbst. Erster Test für `PhotoConsentStep` überhaupt (`consent-step.test.tsx`), Name **exakt** gepinnt. HANDOVER §7.14 |
| 12 | 🚨 Drei Auth-Schalter dürfen NICHT an | ⛔ **Dauerhinweis** | „Require current password when updating", „Secure password change", „Enable Captcha protection". Details HANDOVER §7 Punkt 12 — Captcha würde **jede Teilnehmer-Anmeldung** killen. |
| 13 | Aufstellungs-Formular im Browser ansehen | 🟢 klein | Tests grün, RLS bewiesen, aber nie geöffnet — ein Agent kann sich nicht einloggen. 3v3-Turnier → Teilnehmer → „Team nachmelden" → drei Zeilen. HANDOVER §7.16 |
| 14 | Kein e2e für Nachmeldung / Live-Steuerung / Riegel | 🟡 | Der Riegel wäre der lohnendste — einzige Stelle, an der ein Fehlklick unwiederbringlich Daten kostet. Vorher §7.1 lesen. HANDOVER §7.17 |
| 15 | Geburtsdatum-Prüfung doppelt gepflegt | ✅ **fertig** | ⚠️ Hieß vorher „nimmt Geburtsdaten aus der Zukunft", Beleg „Moritz b." (`2026-07-10`) — **beides falsch**: die `refine()` lehnt Zukunft seit `1bbcfe4` ab, und jenes Datum lag bei Anlage in der Vergangenheit. Echt war die schwächere Kopie und dass der öffentliche Pfad **ohne Server-Action** mit dem Anon-Key schreibt. Jetzt `validBirthdate()` im Formular + CHECK auf `participants.birthdate`. HANDOVER §7.18 |
| 16 | Müll-Dateien entstehen weiter | 🟡 | Am 2026-08-10 kamen zehn neue nach dem ersten Aufräumen, abends noch `` web/1900-01-01` `` — gelöscht, Ursache weiter unbekannt (zwei Repro-Versuche gescheitert). ⚠️ **`git status` sieht nicht alle:** `design-refs/s.trim()` liegt seit 2026-06-16 in einem ignorierten Ordner. Suchen mit `find -size 0`. HANDOVER §7.15 |

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

## Session 2026-08-10 (später) — Nachmeldung, Live-Steuerung, Regenerate-Riegel

Vollständig in **[HANDOVER.md §5](HANDOVER.md)** („Neu am 2026-08-10 (Nachmeldung, …)").

**Auslöser war kein Ticket, sondern ein Junge an der Theke.** Mitten im laufenden Turnier wollte
noch jemand mitspielen — und es gab schlicht keinen Weg, ihn einzutragen. Der Notbehelf an dem Abend:
Turnierstatus von Hand auf `registration` zurücksetzen, anmelden lassen, Bracket neu generieren.

**Was daraus gebaut wurde.** Vier Dinge, jedes aus dem vorigen entstanden:
1. **Nachmeldung** (`5e4c211`) — Orga legt einen Walk-in an und checkt ihn ein. Brauchte eine
   Insert-Policy, die es für Staff gar nicht gab.
2. **Live-Steuerung ohne Scorekeeper** (`b3e625b`) — die Steuerung aus `/score/[token]` wurde geteilt
   und liegt jetzt auch in der Matchliste. Kein neues RPC, keine neue Berechtigung.
3. **Riegel gegen versehentliches Löschen** (`4bcc853`, `2e89b0f`, `0f6e032`) — weil Nachmelden
   „Bracket neu generieren" zur Alltagsaktion mitten im Turnier macht, und das löschte bis dahin
   kommentarlos alles.
4. **Aufstellung bei Team-Turnieren** (`4651579`, `e634f7d`) — nachgereicht, nachdem zwei live über
   das Formular angelegte 3v3-Teams mit null Spielern in der DB standen.

**Wie verifiziert.** Nicht durch Behauptung: RLS beider neuen Policies mit **angenommener Rolle**
gegen die Live-DB, jeweils in zurückgerollter Transaktion, inklusive der beiden Verbotsfälle
(Nicht-Staff; Staff auf fremde `user_id`). Der Riegel wurde an einem eigens gebauten Testturnier
gegen die echten Zahlen nachgezählt und der Wortlaut durch den **ausgelieferten** `lostWork()`
gejagt, nicht aus dem Kopf zitiert. Nachmeldung und Riegel hat der User selbst live durchgeklickt.

**Was gut war.** Der Riegel sitzt in der Action, nicht im Knopf — dadurch schützt er auch jeden
künftigen Aufrufer. Und dreimal nachgefragt statt geraten, als der User „ne nix machen nix löschen"
schrieb: die Antwort war in beide Richtungen lesbar, und es ging um Datenverlust.

**Was schlecht war.** ⚠️ Beim ersten RLS-Test steckten Teilnehmer und Aufstellung in **einem**
Statement — die Policy sah die eben angelegte Zeile nicht, und der Fehlschlag sah nach Policy-Bug
aus. Testaufbau, nicht Code. Außerdem hatte ich ein Testturnier gebaut, dessen Zustand der User
kurz darauf durch einen eigenen Klick verbrauchte; wer so etwas anlegt, sollte damit rechnen, dass
parallel jemand daran arbeitet. Und ein Komponententest behauptete zuerst eine Fehlermeldung, die
`required` im Browser gar nicht entstehen lässt.

## Nächster Schritt

**Stand 2026-08-10.** Auth-Kette ist geschlossen und in Produktion bewiesen; die Teilnehmer kommen
jetzt auch von einem zweiten Gerät an alles Nötige. Die Turnierleitung kann seither außerdem
nachmelden, Matches selbst starten und zählen — und „Bracket neu generieren" nimmt keine Arbeit
mehr mit, ohne vorher zu sagen, welche.

1. **Kleine Handgriffe:** #9 (irreführende Meldung nach abgelaufenem Recovery-Fenster).
2. **Vom User zu entscheiden:** #10 (Magic-Link ebenfalls cross-device?), #8 (Pro-Plan wegen
   Leak-Schutz — reine Kostenfrage).
3. **Liegt unverändert:** #4 Live-Acceptance-Durchlauf ([ACCEPTANCE.md](ACCEPTANCE.md)), #3
   Push-Gerätetest, #7 Live-Score-Capture, sowie die 35 verwaisten Signatur-Objekte im
   `consent-signatures`-Storage (SQL-Delete blockiert, nur über Dashboard/Storage-API).
5. **Neu offen aus der Nachmelde-Session:** #13 (Aufstellungs-Formular einmal im Browser ansehen),
   #14 (kein e2e für die neuen Funktionen).
4. ⚠️ **Vor jedem Anfassen der Auth-Einstellungen:** #12 lesen. Drei Schalter sehen dort nach
   Verbesserung aus und würden je einen Teil der App abschalten.
