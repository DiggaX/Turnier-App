# Turnier-App — Übergabe an den nächsten Agent

**Stand:** 2026-08-10 · Branch `main` @ `b47a4b1` · **gepusht und live** unter https://turnier-app-opal.vercel.app (Push auf `main` deployt automatisch, siehe §3)

Lies zuerst diese Datei, dann `CLAUDE.md` (Regeln) und die Auto-Memory unter
`C:\Users\Rene\.claude\projects\C--Users-Rene-Turnierapp\memory\` (MEMORY.md + die verlinkten Dateien).

---

## 1. Was die App ist
Ein **Multi-Tenant-Esports-Turnier-SaaS**. Firmen (Organisationen) registrieren sich selbst, laden Mitglieder ein, legen Turniere in 5 Formaten an. Spieler melden sich mobil an (anonyme Auth, mit Eltern-Einwilligung für Minderjährige), checken per QR ein, tragen Ergebnisse ein (Schiri bestätigt), verfolgen ein Live-Board. Jede Firma hat ihren isolierten Bereich unter `/o/<slug>`.

## 2. Stack
- **Frontend/Backend:** Next.js **16.2.9** (App Router) im Unterordner **`web/`**. Vercel Root Directory = `web`. ⚠️ Next 16 hat Breaking Changes ggü. Trainingsdaten: async `params`/`searchParams`/`cookies()`/`headers()`, Middleware heißt `proxy.ts`, Turbopack-Build. **Vor Next-Code: `web/node_modules/next/dist/docs/` lesen** (steht auch in `web/AGENTS.md`).
- **DB/Auth:** Supabase (Postgres + RLS + Anonymous Auth + Storage + Realtime). Projekt-Ref **`zqhdbygopftretjtlods`**.
- **UI:** Tailwind v4 + shadcn/ui (button/badge/card/checkbox/input/label/table — **kein Select**, nutze native `<select>`). Dark-Esports-Design: BG `#07090c`, surface `#10141c`, lime `#c5f72e`, cyan `#1fd1e3`, live-red `#ff3b5c`; Fonts Space Grotesk (variabel) + Chakra Petch.
- **Forms:** react-hook-form + zod. **Tests:** Vitest (**393** Unit-Tests grün) + Playwright (e2e geschrieben, s.u.).
- ⚠️ **UI-Primitive sind Base UI (`@base-ui/react`), NICHT Radix.** `components.json` steht auf `base-nova`, ein `@radix-ui/*`-Paket existiert nirgends. Polymorphie über `render={…}` statt `asChild`, Zustände über `data-checked`/`data-open` statt `data-state`. Wer nach shadcn-Gewohnheit Radix-Code schreibt, baut gegen eine Bibliothek, die nicht da ist.

## 3. Deploy & DB — WIE (wichtig!)
- **Deploy: automatisch bei Push auf `main`.** Das Vercel-Projekt `turnier-app` ist mit `github.com/DiggaX/Turnier-App` verbunden — ein Push löst einen Production-Build aus (Root Directory = `web`, Alias `turnier-app-opal.vercel.app`). Am 2026-08-08 verifiziert: Build-Log des Live-Deployments zeigt `Cloning github.com/DiggaX/Turnier-App (Branch: main, Commit: 76be6f6)`. **Vorher stand hier „kein Auto-Deploy" — das war veraltet und hat zu unnötigen Handläufen geführt. Erst `vercel inspect --logs <url>` fragen, bevor jemand von Hand deployt.** Manuell geht weiterhin `vercel deploy --prod --yes` vom Repo-Root (eingeloggt als `moellersrene-3676`). ⚠️ **Brain (Obsidian `Zweites-Gehiern`) NIE pushen** — nur lokales Git, kein Remote.
- ⚠️ **Commit-Autor muss eine Adresse sein, die GitHub kennt — sonst verweigert Vercel den Deploy.** Bis zum 2026-08-08 committete das Repo als `moellers.rene@gmx.de`; diese Adresse ist auf dem GitHub-Konto `DiggaX` nicht hinterlegt, GitHub liefert für solche Commits kein Autor-Objekt zurück, und Vercel bricht mit „GitHub user not found / Fix Git Configuration" ab. Repo-lokal steht jetzt `83634183+DiggaX@users.noreply.github.com` (die noreply-Adresse des Kontos, immer auflösbar, keine Verifizierung nötig). Global bleibt `tgn-digga@gmx.de` unangetastet. **Nicht auf eine beliebige Adresse zurückstellen.** Prüfen lässt es sich über die GitHub-API: liefert ein Commit ein `author`-Objekt mit `login`, passt es.
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

### Neu am 2026-08-08
**Handscanner läuft jetzt wirklich** (am Zebra TC26 verifiziert: Check-in um 07:10 in `check_ins`). Vier Ursachen steckten übereinander, alle vier gefixt:
1. **IME-Kanal** (`use-hardware-scan.ts`, 2. Effect): Android-Chrome liefert DataWedge-Tasten über den IME-Pfad als `key="Unidentified"` (keyCode 229) — pro Taste ist da nichts zu holen, und ohne fokussiertes Feld kommt der Text gar nicht an. Deshalb hält die Seite ein unsichtbares `<input data-scan-capture>` (`sr-only`, `inputMode="none"`) fokussiert und liest den Scan aus dessen `input`-Events. Der Keydown-Weg bleibt als zweiter Kanal.
2. **Tasten-Abstand 60 ms → 500 ms** (`MAX_KEY_GAP_MS`): Zebras eigene KB empfiehlt für Chrome-Web-Apps Key Event Delay ≥50 ms — das killte jeden Scan deterministisch. Erkennung läuft jetzt über Enter-Abschluss + `MIN_SCAN_LENGTH`, nicht über Timing.
3. **`isTypingTarget`** matchte jedes INPUT/SELECT, also auch Kamera-Auswahl und Zoom-Slider. Auf Android bleibt der Fokus nach dem Antippen dort → jeder Scan stumm geschluckt. Jetzt zählen nur echte Texteingaben (TEXTAREA, contentEditable, Text-artige Input-Typen); das Capture-Feld ist explizit ausgenommen.
4. **Diagnose zeigt jetzt Rohdaten** (`scan-diagnostics.tsx`): jede ankommende Taste mit Abstand + Ziel-Element, plus verworfene Bursts mit Grund. Vorher wurden nur voll akzeptierte Scans geloggt — das Panel war von Hand nicht testbar und schob jeden Fehler auf DataWedge. **Smoke-Test:** `123456` + Enter tippen muss einen Eintrag erzeugen.

**Kanal wird mitgeschrieben:** `checkin_method` hat neu `camera_scan` + `hardware_scan`; `qr_scan` bleibt als Altwert stehen. Der `check_in`-Guard ist dabei umgedreht worden — Selbstbedienung (`station`/`online`) ist jetzt die **Allowlist**, alles andere verlangt Staff der Org. Vorher war `qr_scan` als einziger Staff-Pfad ausgezeichnet, wodurch jede später ergänzte Methode automatisch zur Self-Check-in-Methode geworden wäre. Fällt jetzt zu.

**Commit-Identität repariert:** Vercel verweigerte den Deploy, weil GitHub die Autor-Adresse nicht auflösen konnte — Details und die Prüfmethode in §3.

### Neu am 2026-08-10 (Auth + Teilnehmer-Zugang)

Drei Dinge, die alle an derselben Frage hingen: **wie kommt jemand wieder rein, der sein Gerät nicht mehr hat.**

**Passwort-Reset für Orga** (`6e3e21c`). Bis dahin gab es keinen. Jedes Staff-Konto bekommt bei
der Registrierung ein Passwort, aber wer es vergaß, kam nur noch per Magic Link rein — und fand
dort keinen Weg zu einem neuen. Neu: `/passwort/vergessen` schickt die Mail, `/passwort` setzt
das Passwort. **Eine** Seite für beide Fälle, sie entscheidet den Modus selbst.

- ⚠️ **Das Unterscheidungsmerkmal ist ein Cookie, und das ist der Kern.** Aus der Reset-Mail
  kommend kann nicht nach dem alten Passwort gefragt werden — das ist ja das Vergessene. Beim
  normalen Ändern muss gefragt werden, sonst reicht ein unbeaufsichtigtes Handy zur Übernahme.
  `/auth/confirm` setzt bei `type=recovery` ein httpOnly-Cookie `pw_recovery` (15 min,
  `src/lib/auth/recovery.ts`), und **nur** dieses Cookie erlässt die Abfrage. Ohne den Marker
  wäre die Abfrage Deko: wer eine Session hat, ruft einfach die Reset-Variante der Seite auf.
- **Kein `next`-Parameter, bewusst.** `type` steht ohnehin in der URL und wählt zwischen zwei
  fest verdrahteten Pfaden. Ein `next` hätte eine Allowlist gegen Open Redirect gebraucht —
  Angriffsfläche für nichts.
- **Das Reset-Formular meldet immer Erfolg**, auch wenn Supabase einen Fehler liefert. Supabase
  errort bei unbekannten Adressen absichtlich nicht, und die UI darf es auch nicht, sonst ist sie
  ein Orakel dafür, welche Adressen ein Konto haben. **In `passwort/actions.test.ts` festgenagelt**
  — eine spätere „hilfreiche" Fehlermeldung würde das sonst lautlos aufheben.
- Reihenfolge in `setPassword` nicht tauschen: `signInWithPassword` (Alt-Passwort-Prüfung) rotiert
  die Session-Cookies, muss also **vor** `updateUser` laufen.

**Zugang-sichern-Dialog nach der Anmeldung** (`3a324b5`, eingehängt mit `0f8d0fd`). Kinder werden
auf dem Eltern-Handy angemeldet, und der Fertig-Screen mit „Für später sichern" war wegklickbar.
Jetzt blockiert ein `AlertDialog` mit Häkchen „Hab ich gespeichert".

- ⚠️ **Base UI: kontrolliertes `open` OHNE `onOpenChange` macht Escape wirkungslos** (der Store
  liest `openProp ?? open`) — **aber genau dann läuft auch der Unmount nie**. Im Browser gesehen:
  nach dem Bestätigen stand das Popup mit `display: block` in voller Höhe über dem Fertig-Screen,
  während der Hintergrund schon wieder bedienbar war. Lösung: `open` bleibt konstant `true`, die
  **Elternkomponente hängt die Komponente aus**. Wer hier `open` togglen will, baut den Bug neu.
- **Nichts ist an einen erfolgreichen Download/Share/Clipboard gekoppelt.** Alle drei scheitern auf
  manchen Geräten (iOS-In-App-Webviews); ein Modal, aus dem man nicht rauskommt, wäre schlimmer als
  ein ungesicherter Link. Die Checkbox ist Selbstauskunft, der QR steht im Dialog (Screenshot ist
  die häufigste Sicher-Geste), und die rohe URL liegt als markierbarer Text daneben.
- ⚠️ **`aria-label` auf einer Base-UI-Checkbox INNERHALB eines `<Label>` verdoppelt den Namen** —
  Base UI hängt zusätzlich `aria-labelledby` an. Ergab „Hab ich gespeichert Ich habe den QR-Code
  oder den Link gespeichert". Im Dialog entfernt; **dasselbe Muster steckt noch in
  `register/consent-step.tsx`**.

**Teilnehmer-Link darf jetzt schreiben** (`015b759`, Migration `20260810140000_participant_link_writes.sql`).
`/t/[id]/me?token=` war read-only. Am Turniertag steht aber das Kind da und das Eltern-Handy ist weg.

- **Die Session lässt sich nicht übertragen.** Teilnehmer sind anonyme Auth-User ohne E-Mail — es
  gibt nichts, was man einem zweiten Gerät schicken und dort einlösen könnte. Die Autorisierung
  muss also am `qr_token` hängen. Der ist ohnehin der Ausweis (die Orga scannt ihn zum Einchecken),
  also ist das kein neues Vertrauensniveau, sondern derselbe Ausweis ohne den Weg zur Theke.
- Drei SECURITY-DEFINER-Funktionen, alle für `anon` freigegeben: `check_in_via_token`,
  `report_match_via_token`, `get_open_match_by_qr_token`.
- ⚠️ **Die dritte ist nicht Bequemlichkeit, sondern nötig:** `matches` ist öffentlich lesbar,
  `match_reports` nicht (dessen Policy will `p.user_id = auth.uid()`). Ohne sie lädt eine bereits
  abgegebene Meldung nie zurück, und jede Korrektur sieht aus wie eine Erstmeldung.
- **`check_in_via_token` ist idempotent, anders als `check_in()`** — für `anon` aufrufbar, sonst
  schreibt jeder Linkinhaber die `check_ins`-Historie voll.
- **`checked_in_by` bleibt NULL.** Welche Session der Browser trägt, ist irgendwer, nur nicht der
  Teilnehmer. Dieses NULL unterscheidet zugleich Link- von Session-Check-in — deshalb brauchte es
  **keinen** neuen `checkin_method`-Wert.
- **Push bleibt bewusst draußen.** Eine Subscription gehört zu einem Gerät.
- Bewiesen in einer zurückgerollten Transaktion: Check-in setzt den Zeitstempel und schreibt genau
  eine Zeile mit leerem Akteur, zweiter Aufruf legt nichts nach, Meldung landet, **fremder Token
  wird abgelehnt**; danach null Spuren gegengeprüft. Anschließend in einem Browser ohne Session
  für diesen Teilnehmer geöffnet: Match-Karte und Meldeformular da, Push nicht.

**Supabase-Auth-Konfiguration steht jetzt** (Dashboard, kein Code):
SMTP über Resend (`smtp.resend.com`:465, User `resend`, Absender `noreply@pilotra.de`, Domain in
Resend verifiziert), Recovery-Template auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`,
Site URL + Redirect-Liste geprüft, **Anonymous-Rate-Limit 30 → 200/h**.

- ⚠️ **Das Anon-Limit zählt PRO IP.** Am Turniertag hängen alle Teilnehmer im selben WLAN. Bei 30
  wäre ab dem 31. Kind pro Stunde für alle Schluss gewesen — mitten im Einlass.
- **Ende zu Ende bewiesen:** Reset auf Produktion ausgelöst, Mail im Resend-Log `delivered`,
  Absender korrekt, Link in der `token_hash`-Form, **in einem fremden Browser geöffnet** → landet
  im Reset-Modus. Cross-Device funktioniert damit real, nicht nur auf dem Papier.

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
- **Handscanner ≠ Kamera, und er hat ZWEI Empfangswege:** Das Zebra TC26 scannt mit einem SE4100-Laser-Imager, der **nie** in `getUserMedia` auftaucht. DataWedge spielt den Scan als Tastatureingaben ein — auf Android aber oft über den IME-Pfad, wo jede Taste als `key="Unidentified"` ankommt und ohne fokussiertes Feld gar nichts ankommt. Deshalb: `use-hardware-scan.ts` hört auf `document`-`keydown` **und** hält ein unsichtbares Capture-Feld fokussiert (`data-scan-capture`), dessen `input`-Events den IME-Fall abdecken. Doppelte Log-Zeilen („tasten" + „text") bei einem Scan sind normal — `handleToken` dedupliziert über `DEBOUNCE_MS`. ⚠️ **Keine Timing-Heuristik unter ~500 ms bauen**: DataWedges empfohlener Key Event Delay liegt bei 50–100 ms, ein 60-ms-Fenster unterdrückt jeden Scan. DataWedge-Einstellung: Profile0 → Barcode Input + Keystroke Output + „Send Characters as Events" + „Send ENTER key", Profil muss `com.android.chrome` zugeordnet sein.
- ⚠️ **`isTypingTarget` niemals wieder auf „jedes INPUT/SELECT" ausweiten.** Ein fokussierter Kamera-Selector oder Zoom-Slider schluckte damit jeden Scan spurlos — und genau das tut die Bedienung („Linse wählen, dann scannen"). Nur echte Texteingaben zählen.
- **Touch-Größen** liegen zentral in `globals.css` unter `@media (pointer: coarse)` — nicht in Einzelkomponenten duplizieren.
- **Generatoren** sind pure TS (TDD): `web/src/lib/bracket/*`, `swiss/*`, `groups/*`. Swiss/Gruppen werden runde-für-runde fortgeschrieben.

## 7. OFFEN / To-do (für dich)
0. ✅ **Erledigt — live ist `76be6f6`.** Der Push hat automatisch deployed (siehe §3), inklusive Kanal-Commit `f19994a`. `20260808060000_checkin_scan_channel.sql` ist am 2026-08-08 angewandt und die Guards sind bewiesen (Fremder + `hardware_scan`/`camera_scan` → blockiert, Fremder + `online` → blockiert, Staff der Org + `hardware_scan` → erlaubt; Testschreibvorgänge per Sentinel-Exception zurückgerollt, keine Spuren in `check_ins`). Die DB akzeptiert die neuen Werte also bereits, der **Live-Client sendet aber noch `qr_scan`** — der Kanal landet erst nach `vercel deploy --prod --yes` in der Tabelle. Cross-Org-Staff ließ sich nicht empirisch prüfen (es existiert nur eine Org); der Pfad läuft unverändert über `is_staff_of_participant_org`.

### Neu am 2026-08-08 (Nachmittag)
- **Scan-Panel neu, pretixSCAN-inspiriert** (`checkin/scanner-client.tsx` + neu `scan-result-card.tsx`): Segmented Control **Kamera | Handscanner** (pro Gerät in `localStorage["turnierapp.checkin.scanMode"]`; im Handscanner-Modus ist `<Scanner>` gar nicht gemountet — kein `getUserMedia`, aber **beide Wedge-Kanäle laufen weiter**, das Capture-Feld bleibt in beiden Modi stehen). Bedienelemente (Kamera-Wahl, Neu suchen, Zoom, Diagnose) sitzen hinter einem Zahnrad; **Kamera-Fehler bleiben bewusst außerhalb davon sichtbar**. Ergebnis ist jetzt eine große Farbkarte (lime/warn/live) mit Icon, Name und 4-s-Countdown-Balken statt einer Textzeile — `resultContent()` ist pure und in `scan-result-card.test.ts` gepinnt.
- **Am Gerät verifiziert** (2026-08-08, nach Deploy): Panel läuft, alle Kanäle schreiben ihren Wert, `qr_scan` wächst nicht mehr (nur noch Altwert).
- **Iteration 2** (`55d2c32`): Der Platzhalter „Handscanner bereit" ist ersatzlos raus — er wiederholte nur den Modus-Schalter und schob das Ergebnis nach unten. Im Handscanner-Modus steht die Ergebnis-Karte jetzt ganz oben, im Kamera-Modus liegt sie als **Overlay über dem Livebild** (`variant="overlay"` in `scan-result-card.tsx`). ⚠️ **Die Ton-Füllungen sind durchscheinend** (`bg-lime/10` usw.) — über Video braucht die Karte eine deckende Ebene, und die muss ein **eigenes Element** sein: zwei Hintergrund-Utilities auf einem Knoten entscheidet die Stylesheet-Reihenfolge, nicht die Reihenfolge im `class`-String. Idle rendert im Overlay nur `sr-only`, der `aria-live`-Container bleibt aber montiert (eine Live-Region, die zusammen mit ihrer ersten Meldung erscheint, wird unzuverlässig vorgelesen).
- **Anwesenheitsliste synct nach Scans:** `handleToken` ruft im Erfolgszweig `router.refresh()` (aktualisiert Tabelle **und** den „x von y anwesend"-Zähler, Client-State bleibt erhalten). Bewusst **nur** bei Erfolg — „schon anwesend" bricht vor dem RPC ab, Fehler schreiben nichts. Kein Realtime: andere Geräte sieht man weiterhin erst beim eigenen Reload.
- **Manueller Check-in:** neue `checkin_method` **`manual`** (`20260808090000_manual_checkin.sql`) + Server-Action `manualCheckIn` und ein „Einchecken"-Knopf in der Anwesenheitsliste — Gegenstück zu „Zurücksetzen", für kaputten QR oder leeres Handy. Guard brauchte keine Änderung: `check_in` behandelt seit dem Kanal-Commit jede Methode außerhalb der Self-Service-Allowlist automatisch als Staff-only. Ende-zu-Ende verifiziert (Zeile mit `method='manual'` in `check_ins`).
1. **e2e nie ausgeführt:** ~20 Specs in `web/e2e/*.spec.ts` sind geschrieben, aber nur build+unit-grün. Brauchen lokalen Dev-Server + Test-Creds (`E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD`). ⚠️ Nach dem DB-Wipe zeigen sie ggf. auf nicht mehr existierende Fixtures. Kein aktives e2e-Sicherheitsnetz.
2. **Cross-Device: für Reset erledigt, für Magic Link weiter offen.** Am 2026-08-10 wurde **nur** das
   *Reset-Password*-Template auf die `token_hash`-Form umgestellt (bewusst, das Magic-Link-Template ist
   eine eigene Entscheidung). ⚠️ **Und dabei fiel eine Annahme in §6 um:** der Token in der Mail trägt
   weiterhin das Präfix `pkce_`, **öffnet aber trotzdem in jedem Browser**. Empirisch geprüft, nicht
   hergeleitet. Das Präfix bindet nur den `?code=`-Pfad über `exchangeCodeForSession`; `verifyOtp` mit
   `token_hash` braucht den Verifier nicht. Wer den Magic Link umstellt, sollte also nicht mit
   „PKCE geht sowieso nicht cross-device" argumentieren — der Grund ist allein die Linkform.
3. **36 verwaiste Storage-Objekte** aus der Zeit vor dem Wipe. Per SQL nicht löschbar (Supabase blockt), nur über Dashboard/Storage-API.
4. **Push** nie auf echtem Gerät getestet (VAPID-Keys sind gesetzt).
5. **Datei-Hygiene:** zwei Migrationen teilen den Timestamp `20260628090000`. Live-DB korrekt, nur Datei-Kollision; bei Gelegenheit umbenennen (NICHT neu anwenden).
6. ✅ **Geleakter `sb_secret_…`-Key ist rotiert** (laut `docs/FORTSCHRITT.md` am 2026-06-18). Diese Zeile stand bis 2026-08-09 fälschlich als offen und hat zu falschen Empfehlungen geführt. Am 2026-08-09 geprüft: in der gesamten Historie taucht nur die geschwärzte Form `sb_secret_…` auf, nie ein Key-Wert; `.gitignore` deckt `.env*` ab, getrackt ist allein `web/.env.example`.
7. ✅ **`accept_invite` gefixt** (`20260809100000_accept_invite_atomic.sql`, angewandt + bewiesen). Zwei Fehler steckten übereinander: (a) `select` → prüfen → `insert profiles` → `update` ließ zwei gleichzeitige Einlöser desselben Codes beide durch — jetzt entscheidet **ein** bedingter UPDATE (`code` ist UNIQUE, der Verlierer trifft 0 Zeilen und wirft, was sein eigenes Profil zurückrollt); die Vorabprüfungen bleiben nur für die Fehlertexte. (b) **`accept_invite` konnte noch nie funktionieren**: `org_invites.role` ist `text`, `profiles.role` der Enum `user_role`, und Postgres castet dazwischen nicht — der Insert warf bei jedem Aufruf 42804. Unentdeckt, weil nie eine Einladung existierte (`org_invites` war leer). ⚠️ **Reihenfolge nicht umdrehen:** `accepted_by` hat einen FK auf `profiles(id)`, das Profil muss vor dem UPDATE stehen. **Am 2026-08-09 erstmals echt durchgespielt** (Einladung anlegen → `/signup?invite=…` → Konto → `/organizer`): funktioniert, das Profil bekam Rolle `organizer` — womit der Enum-Cast auch produktiv bewiesen ist. Ungültige und abgelaufene Codes sperren den Absende-Button (`canSubmit`), und scheitert `accept_invite` nach der Kontoanlage, räumt `cleanupOrphanedUser` den Auth-User weg.
8. **Supabase-Advisor** (2026-08-09): 61 Hinweise, **0 ERROR**. Die 45 „SECURITY DEFINER ist aufrufbar"-Warnungen sind bei dieser Architektur erwartbar — die Guards sitzen in den Funktionen, stichprobenartig verifiziert (`set_member_role`/`remove_member`: `is_admin()` + Org + Selbstschutz; `get_scorekeeper_tokens`: `is_staff()` + Org). Die 13 „Anonymous Access"-Warnungen sind Form, nicht Substanz: die Policies stehen auf `public`, ihre `USING`-Klauseln sind für `anon` falsch. ⚠️ **„Leaked Password Protection einschalten" ist KEIN Ein-Klick-Punkt** — am 2026-08-10 im Dashboard nachgesehen: das Feature ist „Only available on Pro plan and above", das Projekt läuft auf **Free**. Der Advisor wird es weiter melden; das ist eine Plan-Grenze, kein Versäumnis. Nicht nochmal Zeit darauf verwenden.
9. **Nächste Feature-Idee** (Memory `turnier-app-live-score-capture`): Live-Score-Auto-Capture von Laptops (CS2 GSI / Valorant API / OCR) → Realtime-Board.
10. **Wettbewerbs-Lücken** (Memory `turnier-app-competitor-tournify`): Auto-Scheduler + Präsentationsmodus.
11. **Check-in-Liste ist Polling, kein Realtime** (bewusst, siehe Kommentar an `ATTENDANCE_POLL_MS`): `participants` darf nicht in die `supabase_realtime`-Publication, weil die `anon`-SELECT-Policy `USING (true)` ist und die Zeile `qr_token` trägt — dort schützen nur Spalten-GRANTs, und ob Realtime die auf den Payload anwendet, ist nicht belastbar dokumentiert. Sub-Sekunden-Sync gehörte auf einen privaten Broadcast-Kanal per Trigger.
12. 🚨 **Drei Auth-Schalter, die NICHT umgelegt werden dürfen** (Supabase-Dashboard). Alle drei sehen
    nach „mehr Sicherheit, ein Klick" aus und würden je einen Teil der App abwürgen:
    - **Sign In / Providers → Email → „Require current password when updating": AUS lassen.** Der Code
      macht das selbst — aber mit der Ausnahme für den Recovery-Fall (§5). Supabase kennt die Ausnahme
      nicht und würde beim Zurücksetzen nach dem vergessenen Passwort fragen. Der Reset wäre tot.
    - **„Secure password change": AUS lassen.** Verlangt einen Login jünger als 24 h und bricht damit
      `/passwort` für jeden, der länger eingeloggt ist.
    - **Attack Protection → „Enable Captcha protection": AUS lassen.** Greift auf **allen**
      Auth-Endpunkten, und **keine** Stelle im Code übergibt einen `captchaToken` — betroffen wären
      `signInAnonymously` (`lib/supabase/guest-session.ts`, also **jede Teilnehmer-Anmeldung**),
      `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail`, `signUp`. Wenn Bot-Missbrauch
      mal ein echtes Thema wird: erst Widget + Token an alle fünf Aufrufe, dann der Schalter.
    - **Minimum password length** kann auf 6 bleiben; die Server-Action lehnt alles unter 8 ohnehin ab.
      Höher als 8 setzen bringt eine Fehlermeldung, die das Formular nicht vorab abfängt.
13. **Abgelaufenes Recovery-Fenster meldet sich irreführend.** `pw_recovery` läuft nach 15 Minuten ab.
    Wer den Link öffnet und dann weggeht, landet danach im Ändern-Modus, der nach dem **alten**
    Passwort fragt — das er gerade nicht weiß. Man kommt raus (neuen Link anfordern), aber die
    Meldung sagt es nicht. Sauber wäre: den abgelaufenen Recovery-Fall erkennen und direkt benennen.
    Dem User angeboten, er hat es vertagt.
14. **`consent-step.tsx` hat den doppelten Accessible-Name** (`aria-label` + umschließendes `<Label>`,
    siehe §5). Ergibt eine gestotterte Ansage. Im Dialog behoben, hier nicht — eigener Handgriff.
15. **Müll-Dateien im Repo-Root**, 0 Byte, aus kaputtem Shell-Quoting: `'`, `(,`, `0)`, `1`, `m.status`,
    `usage`, `{,`, `web/'`, `web/ACHTUNG`. Leer, Löschen gefahrlos. ⚠️ **Ursache mit abstellen:**
    `git add` mit Pfaden wie `t/[tournamentId]/…` braucht `git --literal-pathspecs add` — die eckigen
    Klammern sind sonst eine Zeichenklasse, und der Schalter muss **vor** das Unterkommando.

## 8. Datei-Landkarte
- `web/src/app/` — Routen. Öffentlich: `page.tsx`, `o/[slug]/`, `t/[tournamentId]/{,register,me,board,checkin-station}`. Auth: `(auth)/login`, `(auth)/signup`, `auth/confirm/route.ts`, `link/[token]/route.ts` (Geräte-Kopplung). Organizer: `organizer/`, `games`, `members` (Org-Name + Geräte + Mitglieder), `tournaments/[id]/{,bracket,matches,participants,checkin,station}`. Scorekeeper: `score/[token]/`.
- `web/src/lib/` — `bracket/`, `swiss/`, `groups/`, `standings.ts`, `tournament/lifecycle.ts`, `org/`, `auth/{staff,org-tournament,device-pairing,device-label}.ts`, `supabase/{server,client,public,admin}.ts`, `format-date.ts`, `hardware-scan.ts`, `scan-feedback.ts`, `push/`, `station/`, `db-errors.ts`, `database.types.ts`.
- Check-in-Scanner (`web/src/app/organizer/tournaments/[id]/checkin/`): `scanner-client.tsx` (Modus-Schalter, Kamera, Check-in-RPC), `scan-result-card.tsx` (Ergebnis-Karte + `resultContent`), `use-hardware-scan.ts` (beide Handscanner-Kanäle + die zwei Diagnose-Logs), `scan-diagnostics.tsx` (Panel), `use-cameras.ts` (Linsen-Liste), `attendance-row.tsx` (Einchecken/Zurücksetzen). Pure Logik: `web/src/lib/hardware-scan.ts`.
- **Passwort-Flow (neu 2026-08-10):** `web/src/app/(auth)/passwort/` (`actions.ts` + `actions.test.ts`, `page.tsx` = Modus-Weiche, `password-form.tsx`, `vergessen/`), `web/src/lib/auth/recovery.ts` (Cookie-Name + `hasRecoveryCookie`), `web/src/lib/origin.ts` (aus `login/actions.ts` herausgelöst — dort wäre jeder Export eine aufrufbare Server-Action gewesen). Routing sitzt in `auth/confirm/route.ts`.
- **Zugang-sichern (neu 2026-08-10):** `web/src/components/ui/alert-dialog.tsx` (Base-UI-Wrapper), `web/src/app/t/[tournamentId]/register/save-access-dialog.tsx` (+ Test), `web/src/components/qr-actions.tsx` (`variant="bare"` + exportiertes `participantRecoveryUrl`, damit angezeigte und kopierte URL nicht auseinanderlaufen).
- `supabase/migrations/` — alle live angewandt. Neu: `20260807170000_tournament_archive.sql`, `20260807200000_device_pairing.sql`, `20260808060000_checkin_scan_channel.sql`, `20260810090000_photo_consent_optional.sql`, `20260810120000_participants_insert_staff.sql`, `20260810140000_participant_link_writes.sql`.
- `docs/superpowers/{specs,plans}/` — Designs + Pläne. `docs/DEPLOY.md` — Deploy/Setup-Notizen.
- Brain (Obsidian, NICHT im Repo): `C:\Users\Rene\Documents\Zweites-Gehirn\02 Projekte\Turnier-App\`.

## 9. Erste Schritte für dich
1. `git -C C:\Users\Rene\Turnierapp log --oneline -10`, `git status`.
2. db2-Verbindung testen: `mcp__supabase-db2__list_tables` (~15 Tabellen erwartet). Bei „Unauthorized" → User muss `SUPABASE_ACCESS_TOKEN_DB2` setzen + Claude Code neu starten.
3. `cd web && npm run build && npm test` (**393** grün erwartet). ⚠️ `npm run lint` meldet 6 Altlasten in
   `checkin/scanner-client.tsx`, `checkin/page.tsx` und `members/actions.test.ts` — vorbestehend, nicht
   von der letzten Session. Nicht erschrecken, aber auch nicht mitschleifen.
4. Mit dem User klären, was ansteht. Vor Feature-Bau: **brainstorming-Skill**.

## 10. Was in dieser Session teuer war (Zeit sparen)
Fünf Bugs waren **unsichtbar statt laut** — die Symptome zeigten nie auf die Ursache:
- „Startseite zeigt alte Daten" → in Wahrheit Build-Time-Prerender (§6).
- „Magic Link geht nicht" → Route warf den fertig verifizierten PKCE-Code weg, und die Login-Seite zeigte den Fehler-Parameter gar nicht an.
- „Button tut nichts" → Hydration-Abbruch wegen Zeitzone (§6).
- „Scanner geht nicht" → `onError` fehlte, jeder Kamerafehler wurde stumm verschluckt.
- „Kamera findet die Scan-Linse nicht" → es war nie eine Kamera, sondern ein Laser-Imager (§6).

Am 2026-08-08 kam derselbe Fehlertyp nochmal, eine Ebene tiefer: Das Diagnose-Panel behauptete „Hier steht, was ankommt", loggte aber nur voll akzeptierte Scans. Damit war „gar nichts kommt an" (DataWedge falsch konfiguriert) nicht von „kommt an, wir filtern es weg" (unser Bug) zu unterscheiden — und der Empty-State schob es immer auf DataWedge. **Ein Diagnose-Werkzeug, das durch dieselben Filter schaut wie der Produktivpfad, diagnostiziert nichts.** Roh loggen, vor jeder Filterung.

**Muster:** Wenn der User sagt „passiert nichts", zuerst prüfen, ob ein Fehlerpfad überhaupt **angezeigt** wird. Und: lokal-läuft-aber-prod-nicht war zweimal ein Zeitzonen- bzw. Umgebungsunterschied, nicht der Code.

### Neu am 2026-08-10 — was teuer war

Diesmal war es ein anderes Muster: **drei plausible Annahmen, die alle falsch waren.** Keine davon
hätte man durch Nachdenken widerlegt, alle drei fielen erst beim Hinsehen.

- **„Leaked Password Protection ist ein Klick"** — stand so im Advisor-Bericht und wurde von mir in
  einen Plan übernommen. Im Dashboard: Pro-Plan-Feature, Projekt auf Free. Kostete einen Umweg samt
  Anleitung für etwas, das gar nicht geht. **Advisor-Empfehlungen nennen keine Plan-Grenzen.**
- **„`pkce_`-Präfix heißt nicht cross-device"** — direkt aus §6 abgeleitet, und ich hatte schon
  Alarm geschlagen, die Template-Umstellung sei wirkungslos. Der Link ging im fremden Browser
  problemlos auf. **Die Regel galt für `exchangeCodeForSession`, nicht für `verifyOtp`.** Fast eine
  Runde unnötiger Umbau.
- **„Kontrolliertes `open` schließt den Dialog"** — bei Base UI schließt es ihn *logisch*, hängt ihn
  aber nie aus. Nur der Klick im Browser hat das gezeigt; Unit-Test und Build waren grün, weil beide
  das DOM nach dem Bestätigen nie ansehen.

**Was gut funktioniert hat und Wiederholung verdient:**
- **Schreibpfade in einer absichtlich abbrechenden Transaktion beweisen** (`do $$ … raise exception 'PROBE …' $$`).
  Man bekommt echte Werte aus der Live-DB und hinterlässt nichts. Danach einmal gegenprüfen, dass
  wirklich nichts blieb.
- **Resend-Log als Beweismittel.** Ob eine Mail rausging, mit welchem Absender und welchem Link, steht
  dort — kein Postfachzugriff nötig, kein „schau mal nach, ob was angekommen ist".
- **`read_page` statt Screenshot, wenn es um Anmeldezustand geht.** Ein Screenshot zeigte ein
  eingeloggtes Dashboard, während die Seite in Wahrheit schon auf den Sign-in umgeleitet hatte —
  gecachte Darstellung. Der Accessibility-Baum hat sofort das Login-Formular gezeigt.

⚠️ **Der MCP-Chrome ist nicht das Chrome, in dem der User surft.** Mehrere Runden gingen dafür drauf,
dass das Supabase-Dashboard im Automatisierungsprofil abgemeldet war, während es im sichtbaren Fenster
des Users lief. `list_connected_browsers` zeigt, was wirklich verbunden ist. Und: **anmelden darf ich
nicht** (Passwörter, Konto-Logins, API-Keys in Felder) — bei Dashboard-Aufgaben früh sagen, welcher
Teil beim User bleibt, statt es am Ende als Überraschung zu liefern.
