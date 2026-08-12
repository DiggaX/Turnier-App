# Turnier-App — Übergabe an den nächsten Agent

**Stand:** 2026-08-12 (Nacht) · Branch `main` · **gepusht und live** unter https://turnier-app-opal.vercel.app (Push auf `main` deployt automatisch, siehe §3)

Session-Protokolle der letzten Arbeit stehen in **§11–§16** (was gemacht, wie entschieden, was gut/schlecht lief).

**Der 2026-08-12 war ein Aufräumtag:** die e2e-Suite ging von **6 auf 35 grün**, und aus §7
sind an einem Tag geschlossen worden: 7.1, 7.2, 7.3, 7.4, 7.5, 7.16, 7.17, 7.19, 7.20, 7.21,
7.23, 7.25, 7.26, 7.27, 7.28, 7.29, 7.33, 7.36, 7.37, 7.38. Chronologie in den
§5-Changelog-Abschnitten „Neu am 2026-08-12 …" (vier Runden plus Gerätetest). Was noch offen
ist, steht in §7 — es ist bewusst wenig und nichts davon dringend.

⚠️ **Am 2026-08-11 liefen zwei Sitzungen parallel auf demselben Repo.** Vor dem Weiterarbeiten
`git fetch` + `git log origin/main` — es kann Arbeit auf `main` liegen, die diese Datei noch nicht kennt.

Lies zuerst diese Datei, dann `CLAUDE.md` (Regeln) und die Auto-Memory unter
`C:\Users\Rene\.claude\projects\C--Users-Rene-Turnierapp\memory\` (MEMORY.md + die verlinkten Dateien).

---

## 1. Was die App ist
Ein **Multi-Tenant-Esports-Turnier-SaaS**. Firmen (Organisationen) registrieren sich selbst, laden Mitglieder ein, legen Turniere in 5 Formaten an. Spieler melden sich mobil an (anonyme Auth, mit Eltern-Einwilligung für Minderjährige), checken per QR ein, tragen Ergebnisse ein (Schiri bestätigt), verfolgen ein Live-Board. Jede Firma hat ihren isolierten Bereich unter `/o/<slug>`.

## 2. Stack
- **Frontend/Backend:** Next.js **16.2.9** (App Router) im Unterordner **`web/`**. Vercel Root Directory = `web`. ⚠️ Next 16 hat Breaking Changes ggü. Trainingsdaten: async `params`/`searchParams`/`cookies()`/`headers()`, Middleware heißt `proxy.ts`, Turbopack-Build. **Vor Next-Code: `web/node_modules/next/dist/docs/` lesen** (steht auch in `web/AGENTS.md`).
- **DB/Auth:** Supabase (Postgres + RLS + Anonymous Auth + Storage + Realtime). Projekt-Ref **`zqhdbygopftretjtlods`**.
- **UI:** Tailwind v4 + shadcn/ui (button/badge/card/checkbox/input/label/table — **kein Select**, nutze native `<select>`). Dark-Esports-Design: BG `#11161f`, surface `#1b2029`, muted/secondary `#242b38`, lime `#c5f72e`, cyan `#1fd1e3`, live-red `#ff3b5c`; Fonts Space Grotesk (variabel) + Chakra Petch. ⚠️ Die drei Grauwerte sind am 2026-08-11 aufgehellt worden (vorher `#07090c` / `#10141c` / `#161c27`) — wer alte Hex-Werte aus älteren Abschnitten dieser Datei kopiert, baut den alten Look wieder ein.
- **Forms:** react-hook-form + zod. **Tests:** Vitest (**405** Unit-Tests grün) + Playwright (e2e geschrieben, s.u.).
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
- **Nie committen:** `.claude/`, `.mcp.json`, `skills-lock.json` (Tooling, absichtlich untracked).
  ⚠️ **`CLAUDE.md` stand hier bis zum 2026-08-12 mit in der Liste — falsch.** Die Datei ist
  getrackt (zuletzt in `b35d523`) und enthält die verbindlichen Projektregeln; sie gehört
  gepflegt und mitcommittet. Wer der alten Zeile folgte, ließ Regeländerungen im Working Tree liegen.
- **Doku-Pflicht (Rene, 2026-08-11):** Jeder abgeschlossene Fix / jedes Feature aktualisiert diese
  Datei **im selben Commit** — Changelog-Abschnitt plus die betroffenen offenen Punkte in §7. Steht
  auch in `CLAUDE.md`. Ebenso dort: Bug-Fixes laufen nach dem **Dreifach-Prinzip** — wer einen Fehler
  findet, behebt ihn nicht selbst; ein zweiter Agent fixt, ein dritter kontrolliert.
- ⚠️ **Workflow-Agents erzeugen manchmal Müll-Dateien im Root**. Nach jedem Workflow `git status` prüfen.
- ⚠️ **Mehrzeiligen Text (SQL, Prosa, Commit-Messages) nie roh in eine Shell-Zeile geben.** Genau daraus
  entstanden am 2026-08-10 elf 0-Byte-Dateien mit Namen wie `m.status`, `(,`, `{,` — Bruchstücke des
  Textes, die als Redirect-Ziel oder Brace-Expansion landeten. Für SQL den db2-MCP nehmen, für
  Commit-Messages `git commit -F -` mit Heredoc, für alles andere das Scratchpad. **Temporärdateien
  gehören nie ins Repo-Verzeichnis.**
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

### Neu am 2026-08-10 (Fotoerlaubnis: freiwillig, nachweisbar, druckbar)

**Die Einwilligung ist keine Zutrittsbedingung mehr** (`0f8d0fd`, Migration
`20260810090000_photo_consent_optional.sql`). Trigger `trg_checkin_requires_consent`,
`enforce_consent_before_checkin()` und `participant_has_valid_consent()` sind **gelöscht**.

- Vorher kam ein Kind ohne Eltern-Unterschrift gar nicht ins Turnier — der Check-in wurde in der
  DB abgelehnt. Wer nicht fotografiert werden will, nimmt trotzdem teil; das ist die Entscheidung
  des Veranstalters, nicht der Datenbank. Ihr Vorliegen wird jetzt nur noch **angezeigt**.
- Anmeldeschritt 2 heißt „Fotoerlaubnis (optional)" und hat einen zweiten, gleichwertigen Weg:
  **„Ohne Fotoerlaubnis fortfahren"** schreibt keine `consents`-Zeile und beendet die Anmeldung.
- Neue Spalten: `consents.address` (das „wohnhaft" des Papierformulars, in der UI Pflicht bei
  Erteilung), `consents.consent_text`, `organizations.address`. Dazu der **Unique-Index
  `consents_participant_id_key`** — `consent-step.tsx` behandelte die Verletzung längst, nur der
  Index fehlte, Doppelzeilen waren möglich.
- ⚠️ **`consent_text` ist ein Snapshot, kein Verweis.** Der Wortlaut kann sich ändern, eine
  erteilte Einwilligung nicht rückwirkend. Zeilen von **vor** dem 2026-08-10 haben `null` — dafür
  gibt es `storedConsentText()` in `lib/consent-text.ts`, das auf `LEGACY_CONSENT_TEXT` zurückfällt
  (den Satz, der damals wirklich auf dem Schirm stand). Nie durch den heutigen Text ersetzen.
- Blau (Token `cyan`) heißt „Fotoerlaubnis liegt vor": Scan-Karte (`resultContent` →
  Ton `cyan`, Detail „Eingecheckt · Fotoerlaubnis erteilt"), Anwesenheitsliste, Teilnehmerliste,
  `/me`. Der Chip steckt in `components/brand/photo-consent-chip.tsx` — **fehlend ist grau, nicht
  rot**, es ist der zweite Normalfall. Der `ScanStatus`-Zweig `"consent"` ist ersatzlos raus.
- Verifiziert in Produktion: Minderjähriger ohne Erlaubnis meldet sich an und checkt ein;
  Anwesenheitsliste zeigt 15× blau, 2× grau.

**Nachweis-Ausdruck für die Unterlagen** (`b47a4b1`): `/organizer/tournaments/<id>/consents`,
verlinkt oben rechts auf der Teilnehmerseite. Ein A4-Blatt pro Person mit Name, Anschrift, dem
zugestimmten Wortlaut, Datum und der Unterschrift.

- **Kein PDF-Generator und keine neue Dependency.** Der Browser druckt seit Jahren nach PDF; der
  Knopf ruft `window.print()`, im Dialog wählt man „Als PDF speichern". Nur `@page` und die
  Seitenumbrüche brauchen echtes CSS (inline im Server-Component), der Rest ist Tailwinds
  `print:`-Variante.
- Die Unterschriften liegen im **privaten** Bucket: ein `createSignedUrls(paths, 600)` für alle
  Blätter zusammen. Ohne signierte Links bleibt im Ausdruck ein leeres Kästchen.

**Org-Stammdaten gesetzt:** Name **„Tourismus-Service Fehmarn"**, Anschrift „Zur Strandpromenade 4,
23769 Fehmarn" — beides pflegbar unter `/organizer/members` (`setOrgAddress`). Die Anschrift steht
im Einwilligungstext; fehlt sie, nennt der Satz nur den Namen. Der Slug bleibt `testverein-fehmarn`.

**Aktueller Datenstand:** DB wurde am 2026-08-07 komplett geleert und neu befüllt. Org **„Abenteuerinsel Fehmarn"** (slug bleibt `testverein-fehmarn`). Admins: `organizer@test.de` / `test1234` (nur Passwort-Login) und `rene.moellers@gmx.de` (Magic Link). Turniere: „Misson: Next Level EA Sports 2026" (Anmeldung offen), „Misson: Next Level Rocket League 2026" (Entwurf), „Sommer Cup 2026" (archiviert).

### Neu am 2026-08-10 (Nachmeldung, Live-Steuerung ohne Scorekeeper, Regenerate-Riegel)

Ausgelöst durch einen echten Vorfall: beim laufenden Turnier stand ein Junge an der Theke, der noch
mitspielen wollte. Es gab **keinen Weg**, ihn einzutragen — `/t/[id]/register` gibt außerhalb von
`status='registration'` 404, und auf `participants` existierte nur `participants_insert_self`. Der
Notbehelf war, den Turnierstatus von Hand zurückzusetzen.

**1. Nachmeldung** (`5e4c211`, Migration `20260810120000_participants_insert_staff.sql`).
Auf der Organizer-Teilnehmerseite: Name, Geburtsdatum, optionaler Gamertag → angelegt und sofort
per `check_in(…, 'manual')` eingecheckt.

- ⚠️ **`user_id is null` in der Policy ist die Sicherheitsgrenze, keine Bequemlichkeit.** Der
  Staff-Pfad legt ausschließlich kontenlose Walk-ins an; ohne diese Bedingung könnte ein
  Staff-Mitglied eine Anmeldung auf eine **fremde** `auth.users`-Id schreiben. Wer diese Bedingung
  je entfernt, öffnet genau das. Beide neuen Policies ziehen die Grenze an derselben Stelle.
- Ein so angelegter Teilnehmer hat **keinen Recovery-Link und keine Fotoerlaubnis** — beides gehört
  der Person, nicht der Orga. Steht auch im Formular.
- Check-in läuft bewusst über das RPC statt über ein direktes `checked_in_at`, damit der
  Audit-Eintrag (`method = 'manual'`) entsteht. Schlägt nur dieser Schritt fehl, existiert der
  Teilnehmer trotzdem — die Meldung sagt das, statt Totalversagen vorzutäuschen.

**2. Aufstellung bei Team-Turnieren** (`4651579` + `e634f7d`, Migration
`20260810140000_team_members_insert_staff.sql`). Bei `team_size > 1` fragt das Formular eine Zeile
pro Teamgröße ab, erste Zeile = Captain (daran hängt `is_captain`). Leere hintere Zeilen fallen
raus, ein Team ganz ohne Spieler wird abgelehnt.

- Grund: `team_members_write_owner` keyt auf `participants.user_id = auth.uid()`, ein Walk-in hat
  kein Konto → die Aufstellung war für die Orga unerreichbar. **Live passiert:** zwei über das
  Formular angelegte 3v3-Teams („Test", „Qqqq") standen mit null Spielern im Turnier.
- ⚠️ **Migrations-Zeitstempel-Kollision** (behoben am 2026-08-12, Datei heißt seitdem
  `20260810143000_…` — §7.5): diese Datei hieß `20260810140000_…` wie
  `20260810140000_participant_link_writes.sql` aus der parallelen Auth-Session. Kosmetisch, weil
  hier über MCP eingespielt wird (die DB-Versionen weichen ohnehin von den Dateinamen ab) — bei
  einem `supabase db push` aber eine Stolperfalle.

**3. Match starten/zählen ohne Scorekeeper** (`b3e625b`). Die Live-Steuerung wanderte aus
`/score/[token]` nach `components/live-score-control.tsx` und wird jetzt **zweimal** benutzt: von
der Scorekeeper-Seite und, eingeklappt unter dem QR, in der Organizer-Matchliste.

- Läuft über dasselbe Match-Token, das die Seite ohnehin per `get_scorekeeper_tokens` lädt →
  **keine neue Berechtigung, kein neues RPC.** Derselbe Link, nur auf einem Schirm, den die Orga
  schon in der Hand hat.
- Klappt automatisch auf, sobald das Match `live` ist.

**4. Riegel gegen versehentliches Löschen** (`4bcc853`, `2e89b0f`, `0f6e032`). Nachmelden macht
„Bracket neu generieren" zur Aktion **mitten im Turnier** — und `generateBracket` löscht alle
Matches. Vorher stand davor nur ein generisches „Fortfahren?".

- `generateBracket(id, { discardResults })` bricht ab, solange Arbeit im Bracket steckt. **Drei
  Sorten**, alle gleich viel wert: `done`, `live`, und **`pending`-Matches mit Spielermeldungen**.
  Die dritte ist die tückische — `match_reports` hängt per `on delete cascade` an der Match-Id, der
  Verlust ist am Match-Status **nicht** zu sehen.
- ⚠️ **Der Riegel sitzt in der Action, nicht im Knopf.** Ein Browser-Dialog ist Höflichkeit; jeder
  künftige Aufrufer bekommt denselben Schutz. Gezählt werden **Matches, nicht Meldungen** — ein
  Match, das beide Spieler gemeldet haben, ist ein Verlust, nicht zwei.
- Der Wortlaut kommt aus `lostWork()` (`lib/bracket/regenerate-warning.ts`), damit Action und
  Dialog nicht auseinanderlaufen und die deutschen Endungen **eine** Stelle haben: „1 gespieltes
  Ergebnis, 1 laufendes Spiel und 2 gemeldete Ergebnisse ohne Freigabe **werden** …".

**Verifiziert.** RLS beider Policies mit angenommener Rolle gegen die Live-DB bewiesen, jeweils in
zurückgerollten Transaktionen: Organizer + Walk-in erlaubt; Nicht-Staff abgelehnt; Organizer auf
fremde `user_id` abgelehnt; Organizer an die Aufstellung eines Teilnehmers **mit** Konto abgelehnt.
Nachmeldung und Riegel hat der User am 2026-08-10 selbst live durchgeklickt und bestätigt.

⚠️ **Beim Nachstellen von RLS-Ketten in SQL:** Teilnehmer und Aufstellung müssen in **getrennten
Statements** eingefügt werden. Steckt beides in einer Anweisung (CTE), sieht die `exists`-Prüfung
der Policy die eben angelegte Zeile nicht und der Insert scheitert — ein Artefakt des Testaufbaus,
kein Policy-Fehler. Genau darauf bin ich erst hereingefallen.

### Neu am 2026-08-10 (Geburtsdatum wird getippt, nicht gesucht)

`<input type="date">` ist an **beiden** Stellen raus — öffentliche Anmeldung und Nachmeldung —
und durch `components/birthdate-field.tsx` ersetzt: drei Zahlenfelder (TT/MM/JJJJ), Zifferntastatur
per `inputMode="numeric"`, Fokus springt nach zwei Ziffern von allein weiter. `10042013`
durchtippen genügt. Auslöser war die Praxis: der native Kalender öffnet beim Geburtsdatum immer
viele Jahre in der Vergangenheit, und am Tresen kostet das jedes Mal mehrere Wischer.

- **Nach außen ändert sich nichts.** Der Wert bleibt ein `YYYY-MM-DD`-String und ist leer, solange
  etwas fehlt — `validBirthdate()`, die zod-Regel und die „erforderlich"-Meldung greifen unverändert.
- **Ein ganzes Datum im Tag-Feld wird verteilt** statt auf zwei Zeichen gekürzt (ISO und
  `TT.MM.JJJJ`). Das deckt das Einfügen aus der Zwischenablage ab — und ist der Grund, warum die
  **elf** vorhandenen Aufrufe, die dieses Feld mit einem ISO-String füllen (fünf Komponententests,
  sechs Playwright-Specs), **ohne Änderung** weiterlaufen.
- ⚠️ **Kein `role="group"` mit `aria-labelledby`, und kein `aria-label` auf dem Tag-Feld.** Das
  sichtbare `<Label>` zeigt per `htmlFor` schon dorthin; beides zusammen vergäbe denselben Namen ein
  zweites Mal — derselbe Fehler wie in `consent-step.tsx`, und Abfragen nach dem Label finden dann
  **zwei** Treffer statt einem. Genau daran sind beim Bauen die Formulartests rot geworden; in
  Playwright wäre es ein Strict-Mode-Verstoß gewesen. Wer hier eine Gruppenbeschriftung nachrüstet,
  muss das `htmlFor` mitnehmen.
- ⚠️ **Der Elternwert wird im Render übernommen, nicht in einem Effect.** Das Orga-Formular leert
  sich nach jedem angelegten Walk-in; ohne diese Übernahme stünde beim nächsten noch das Geburtsdatum
  des vorigen in den Kästchen — ein Fehler, den am Tresen niemand bemerkt. Als Effect gebaut wäre es
  zusätzlich ein Lint-Fehler (`react-hooks/set-state-in-effect`) und ein zweiter Renderdurchlauf.
- ⚠️ **`padOnBlur` liest aus dem Ereignis, nicht aus dem State** (Fix `1dbfbdb`, von der parallelen
  Sitzung gefunden). Die zweite Ziffer lässt den Fokus weiterspringen, das `blur` feuert noch im
  selben Ereignis — `parts` steht dann erst bei der ersten Ziffer. Aus einer getippten `05` wurde so
  `00`, und zwar für **jeden** Tag und Monat unter dem zehnten. Wer hier auf `parts[field]`
  zurückbaut, baut den Fehler neu.

### Neu am 2026-08-11 (Anschrift, und der QR vom letzten Turnier)

**Anschrift dreigeteilt** (`ca1f6fe`): Straße+Nr · PLZ · Ort statt einer Zeile, plus `/api/plz`.
Der unterschätzte Teil ist die Aufteilung selbst — ein einzelnes Feld mit `autocomplete="street-address"`
bieten Handys kaum je zum Ausfüllen an; mit `address-line1` / `postal-code` / `address-level2` greift
die gespeicherte Adresse. Nach fünf Ziffern füllt sich der Ort über die **eigene** Route, damit das
Gerät der Eltern nie mit einem fremden Dienst spricht; hinaus geht nur die Postleitzahl, durchgelassen
von `/^\d{5}$/`. `consents.address` bleibt **eine** Zeile — keine Migration, alte Einträge unberührt.
Drei Vorsichtsmaßnahmen: ein getippter Ort wird nie überschrieben, bei mehreren Orten zu einer PLZ
wird nichts geraten (Auswahlliste), und ein nicht erreichbarer Dienst ist **kein Fehler** — eine
Anmeldung darf nicht an einem fremden Server hängen.

**Scanner checkte ins falsche Turnier ein** (`584be78`). Der Lookup traf nur auf `qr_token`, ohne
Turnier-Filter, und `check_in` prüft nur die **Organisation**. Ein alter QR lief damit **grün** durch
und setzte die Anwesenheit im **alten** Turnier — an der Tür sah das aus wie ein Erfolg, die Person
stand aber auf keiner Liste. Bewiesen in zurückgerollter Transaktion. ⚠️ Die Lücke war kein Versehen:
`void tournamentId` trug den Kommentar „staff RLS already scopes participants". Tut sie nicht — sie
grenzt auf die Organisation ein, und hier gehört alles einer.

**Übernahme am Einlass** (`3e5e392`, `f7cbf95`, Migrationen `20260811140000` + `20260811141000`).
Wer mit dem Code vom letzten Turnier kommt, wird übernommen statt neu angemeldet: Name, Gamertag,
Geburtsdatum werden kopiert, die Person ist sofort eingecheckt. Details in §5.1 unten.

### 5.1 Übernahme — die gebilligte Ausnahme zur `user_id IS NULL`-Grenze

⚠️ **Lies das, bevor du `participants_insert_staff` anfasst.** Weiter oben steht, dass die Bedingung
`user_id IS NULL` die Grenze ist, die Staff daran hindert, Anmeldungen auf **fremde** Konten zu
schreiben. Diese Policy ist **unverändert**. Seit dem 2026-08-11 existiert daneben genau **eine**
Tür, die das darf, und sie ist absichtlich schmal:

`carry_over_participant(p_qr_token uuid, p_tournament_id uuid)` — SECURITY DEFINER.

- **Der Token ist der Parameter, nicht die Teilnehmer-Id, und das ist das ganze Sicherheitsargument.**
  Staff darf jede Teilnehmer-Id der eigenen Organisation lesen; ein Id-Parameter wäre genau das Loch,
  das die Policy bewacht — man könnte für jeden je Angemeldeten eine Anmeldung erzeugen, ohne dass
  die Person da ist. Der `qr_token` ist das, was jemand physisch dabeihat. **Wer den Parameter je auf
  eine Id umstellt, reißt die Grenze ein.**
- **Freischaltung nötig:** `organizations.allow_carry_over`, Standard **aus**, Haken unter
  *Organisation*. Die Funktion liest ihn selbst — eine Bedingung nur in der Oberfläche wäre keine.
- **`is_staff()`, also inklusive `referee`** — am Scanner steht der Schiedsrichter. Bewusst weiter als
  die seit `referee_reduced_rights` auf `is_organizer()` gezogenen Schreibrechte. Der Referee kann per
  direktem UPDATE ohnehin nur `checked_in_at` ändern; die Übernahme läuft über zwei DEFINER-Funktionen,
  daran scheitert sie nicht.
- **Statusgrenzen:** hinein nur `registration` und `running`, nicht archiviert. Absichtlich weiter als
  `assert_team_phase` (nur `registration`) — jenes bewacht Selbstbedienung, wo der Anmeldeschluss das
  Produkt ist; hier steht Staff an der Tür, wo der Anmeldeschluss das **Problem** ist. **Keine
  Inkonsistenz zum Reparieren.** Heraus: jeder Status, auch `finished` und archiviert — das
  letztjährige Turnier ist der Hauptfall.
- ⚠️ **`type` setzt die Funktion selbst.** `guard_participant_protected_fields()` prüft `current_user`;
  innerhalb eines DEFINER-Aufrufs ist das `postgres`, der Wächter kehrt früh zurück und erzwingt
  **nichts**. Der Ausdruck ist wörtlich derselbe wie im Trigger.
- **Nicht kopiert:** `seed`, `checked_in_at`, `team_id`/`is_captain`/`join_code`, `qr_token` (unique,
  ginge gar nicht) — und die **Fotoerlaubnis**. Letzteres ist der wichtigste Punkt: eine Einwilligung
  gilt für das Turnier, für das sie erteilt wurde. Mitkopiert ließe sie den Nachweis-Ausdruck später
  eine Zustimmung behaupten, die es nie gab.
- **Idempotent** über `on conflict (tournament_id, user_id) do nothing`; der zweite Scan desselben
  alten QR liefert dieselbe Zeile mit `created = false`. ⚠️ **`RETURN QUERY` beendet die Funktion
  nicht** — ohne das `return;` im Zweig danach kämen zwei Zeilen zurück und der Client läse „gerade
  neu angelegt". Genau so war es zuerst, gefunden beim Beweisen.
- **Quellen ohne Konto sind ausgeschlossen** (frühere Walk-ins): ohne `user_id` gibt es nichts, woran
  ein zweiter Scan sie wiedererkennt, und der Token ist unique, also nicht kopierbar. Die Meldung
  verweist auf die Nachmeldung.
- **Fremde Organisation und unbekannter Token geben dieselbe Meldung** — sonst wird der Scanner zum
  Orakel darüber, wer anderswo im System existiert.

**Bewiesen** in zurückgerollten Transaktionen, auf SQLSTATE geprüft: erlaubt (inkl. Referee, inkl.
Idempotenz, `type='player'` bei Teamturnier), verboten mit `22023` (Schalter aus, `draft`, `finished`,
archiviert, Team-Zeile, Quelle ohne Konto), `P0002` (unbekannt/fremde Org), `42501` (Gast, `anon`).
Dazu gegengeprüft: ein direkter Insert mit fremder Konto-Id scheitert **weiterhin** an der RLS.

### Neu am 2026-08-11 (Palette aufgehellt) — `5e11b9f`, live

Rene: „geht das ohne das laufende Turnier kaputtzumachen?" — ja, es sind ausschließlich Farbwerte,
kein DB-, Auth- oder Turnier-Code. Die Seite stand auf `#07090c`, nah genug an Schwarz, dass Karten
auf einem Hallenbildschirm keine Kante gegen den Hintergrund hatten.

| Token | vorher | jetzt |
|---|---|---|
| `--color-bg` / `--background` | `#07090c` | `#11161f` |
| `--color-surface` / `--card` / `--popover` | `#10141c` | `#1b2029` |
| `--color-surface-2` / `--sidebar` | `#0a0d12` | `#151a23` |
| `--muted` / `--secondary` | `#161c27` | `#242b38` |
| `--primary-foreground` / `--sidebar-primary-foreground` (Tinte auf Lime) | `#07090c` | `#11161f` |

- ⚠️ **Alle Flächen mussten mitwandern, nicht nur der Hintergrund.** Hebt man nur `--background` an,
  liegt die Seite über der Card (`#10141c`) und die Hierarchie Seite < Card < Muted kippt.
- ⚠️ **Zwei Streifenmuster hatten die alten Grauwerte hartkodiert** statt über Tokens zu gehen:
  `web/src/app/t/[tournamentId]/page.tsx` und `web/src/app/learn/_components/tournaments.tsx`
  (`repeating-linear-gradient`). Ein reiner `globals.css`-Edit hätte sie stehen lassen. **Bei der
  nächsten Farbänderung wieder nach rohen Hex-Werten greppen**, nicht nur die Tokens ändern.
- Der Light-Mode-`:root`-Block ist absichtlich unberührt — die App läuft immer unter `.dark`.
- Akzente (Lime/Cyan/Live-Rot) unverändert; Weiß auf `#11161f` bleibt weit über WCAG-AA.
- **Verifiziert** über die Live-Domain: `getComputedStyle(document.body).backgroundColor` liefert dort
  `rgb(17, 22, 31)`, keine Konsolenfehler.

### Neu am 2026-08-11 (Person/Team-Umbau: jeder Spieler ist ein Mensch) — `d025e41`…`2fececb`, live

Auslöser war eine Frage zu einem 3on3: „was, wenn man kein Team gründet — kann man Spieler später
zusammenschließen?" Ging beides nicht. Der Code kannte nur `team_size > 1` → Team-Formular mit
Pflicht-Captain, und die Mitspieler waren **reine Zeichenketten in `team_members`**: kein
Geburtsdatum, keine Fotoerlaubnis, keine Unterschrift. Minderjährige Mitspieler landeten ohne
Einwilligung auf Turnierfotos. Das war der eigentliche Grund für den Umbau, nicht der Komfort.

**Jetzt ist jeder Mensch eine eigene `participants`-Zeile.** Das Team bleibt die Zeile, die im
Turnierbaum steht — deshalb wurden `matches`, die Formate und das Board **nicht angefasst**.

| Sorte | `type` | `team_id` | `user_id` | `join_code` |
|---|---|---|---|---|
| Team (tritt an) | `team` | NULL | NULL | gesetzt |
| Person in/ohne Team | `player` | Team **oder NULL** | eigener Auth-User | NULL |
| Einzelstarter | `solo` | NULL | eigener Auth-User | NULL |

Neue Anmeldung: eine Person angeben → Fotoerlaubnis → **Team-Schritt** mit drei gleichrangigen Wegen
(gründen + Code teilen, per Code beitreten, bewusst ohne Team weiter). Wiedereinstieg läuft über
`get_my_registration` — Neuladen landet nicht mehr auf dem Formular, wo der zweite Versuch an
`unique(tournament_id, user_id)` starb.

Dazu: Orga-**Teams-Screen** (`/organizer/tournaments/[id]/teams`, Zuordnung per Pointer-Events **und**
Auswahlfeld), **Restspieler-Panel** vor der Bracket-Erzeugung, **Warteschlange** auf „Mein Status"
(„noch 2 Spiele vor dir ≈ 20 Min", aus `tournaments.match_duration_min` × `parallel_stations`),
**Sammel-Freigabe** für alle einigen Partien, und eine **echte Schiedsrichter-Rolle**.

**Elf Migrationen, alle live:** `20260811090000` (Enum `player`) · `091000` (Spalten + Constraints) ·
`092000` (Policies + drei Trigger) · `093000` (neun Team-RPCs) · `094000` (Umzug aus `team_members`) ·
`095000` (Wettkämpfer-Auflösung in den Melde-Funktionen) · `100000`/`101000` (Taktung + Realtime auf
`match_reports`) · `110000` (Schiri reduziert) · `120000` (`match_reports_select` über den
Wettkämpfer) · `130000` (`start_match_as_player`).

⚠️ **Die drei Fallen, die es beim Bauen fast gerissen hätten** — alle live in zurückgerollten
Transaktionen belegt, nicht theoretisch:

1. **Der Schutz-Trigger war ein No-op.** Erster Entwurf: `security definer` **und**
   `current_user = 'postgres'` als Tür für die eigenen RPCs. In einer DEFINER-Funktion ist
   `current_user` **immer** der Eigentümer → Bedingung ausnahmslos wahr, der ganze Feldschutz toter
   Code. Ein Gast konnte per PATCH `team_id`, `is_captain` und `seed` frei setzen. Lösung:
   Guard als **INVOKER**, die eine Leseoperation in einen kleinen DEFINER-Helfer
   (`participant_team_target_ok`). Eine INVOKER-Funktion **innerhalb** einer DEFINER-Funktion erbt
   deren Rolle — deshalb stimmt es in beide Richtungen.
2. **„Wettkämpfer = `team_id is null`" ist falsch.** Ein Spieler *ohne* Team hat ebenfalls NULL, und
   ein gelöschtes Team setzt `team_id` seiner Mitglieder auf NULL. Beides hätte Menschen in den
   Turnierbaum gestellt **und** ihre Klarnamen über den Anon-Key freigegeben. Es entscheidet
   **ausschließlich `type`** (siehe §6).
3. **`tg_op` gibt es in einer Trigger-`WHEN`-Klausel nicht**, und `OLD` darf dort nicht stehen, wenn
   derselbe Trigger `INSERT` abdeckt (42703). Deshalb zwei Trigger `…_ready_ins` / `…_ready_upd`.
   Aufgefallen erst beim Anwenden, weil die Probe den Trigger **ohne** `WHEN` angelegt hatte —
   **immer genau das proben, was auch angewandt wird.**

Zwei Folgeschäden des Umbaus, dabei gefunden und behoben: ein **Teamspieler sah seine eigene
Ergebnismeldung nie** (`match_reports_select` prüfte gegen die eigene Zeile, im Match steht aber die
Team-Zeile → `120000`), und **`/me` zeigte jedem eingeloggten Spieler überall „Gegner"**, weil eine
angemeldete Sitzung per RLS nur die *eigene* `participants`-Zeile sieht (gemessen: 1 sichtbar als
`authenticated`, 17 als `anon`) — Matches werden dort jetzt über `createPublicClient()` gelesen.

**Nebenbei repariert:** das **Unterschriftsfeld nahm unter Umständen gar keinen Strich an**.
`canvas.setPointerCapture()` wirft `NotFoundError`, wenn der Zeiger nicht als aktiv gilt, und stand
ungefangen **vor** `isDrawing = true` — warf es, brach der Handler dort ab, und der Elternteil sah
beim Absenden nur „Bitte unterschreiben." ohne jeden Hinweis. Jetzt in `try/catch`; Capture ist
Komfort, keine Voraussetzung.

**Auf Produktion durchgespielt** (zwei getrennte Gast-Sitzungen, echter Browser): anmelden → Team
gründen → Code → zweites Fenster → beitreten mit **kleingeschriebenem** Code → beide im selben Team,
Gründer Captain. Datenbankseitig gegengeprüft: Team-Zeile ohne Konto und ohne Geburtsdatum, beide
Menschen als `player` mit eigenem Geburtsdatum, **keine Person als Wettkämpfer**. Ebenso belegt:
`anon` sieht 22 von 26 Zeilen (die vier Kinder unsichtbar), eine Person lässt sich nicht in den
Spielplan schreiben, ein Schiedsrichter kann freigeben (`confirm_match` → `done 10:8`, richtiger
Sieger) aber `matches` nicht direkt beschreiben (0 Zeilen).

### Neu am 2026-08-11 (Abend): Härtung nach dem team_size-Vorfall

**Vorfall vollständig aufgeklärt** (13-Agenten-Forensik, jede Linse adversarial gegengeprüft): Beim
Turnier „Mission: Next Level Rocket League 2026" (`8da58fae`) wurde `team_size` zwischen 08:52 und
09:02 von 3 auf 1 gestellt — **Stunden bevor** der Riegel aus `ff71519` um 15:15:53 live ging. Der
Riegel wurde nicht umgangen, er existierte noch nicht. `participants.type` wird beim INSERT gestanzt
und nie nachgerechnet → 10 `player` + 1 `team` aus der 3v3-Welt wurden für das Bracket unsichtbar,
`generateBracket` baute kommentarlos einen Zweier-Baum aus den zwei nach der Umstellung angemeldeten
`solo`-Zeilen. Das Phantom-„Team-Niki" (1 von 3) kam vom **Tresen-Formular**, das bei `team_size > 1`
keinen Einzelweg anbietet — nicht vom Kinder-Team-Schritt (der ist bei Solo-Turnieren korrekt
gesperrt, UI und `assert_team_phase`). Details: §7.34/§7.35-Auflösung und die Fix-Runde unten.

**Acht Härtungs-Fixes, alle drin** (Implementierer → unabhängiger Prüfer → separater Nachbesserer,
Dreifach-Prinzip):

1. `resetCheckIn` setzt jetzt auch `seed = null` — eine stehengebliebene Startnummer hatte die
   Seed-Kollision erzeugt (Team-Niki seed=1 **und** Max seed=1; kein Unique-Index auf
   `(tournament_id, seed)`, geprüft).
2. **Seeding-Block inkl. „Zufällig setzen" ist nach dem Generieren erreichbar** — neue Komponente
   `bracket/seeding-section.tsx`, eine Instanz, in beiden Zweigen gerendert, im `hasMatches`-Zweig
   direkt über „Bracket neu generieren". Ablauf: Zufällig setzen → speichern → Neu generieren. Damit
   ist §7.35 gelöst — der Fisher-Yates-Shuffle existierte längst, er war nur hinter `!hasMatches`
   unerreichbar.
3. Teams-Screen versteckt nichts mehr: rendert, sobald Team-/Spieler-Zeilen existieren, auch bei
   `team_size <= 1` (mit Warnkarte zur früheren Teamgröße). Der Satz „es gibt keine Mannschaften"
   log, solange Team-Niki dastand.
4. Dritte Filterstelle `bracket/page.tsx` nutzt `COMPETITOR_TYPES` statt `p.type !== "player"`.
5. `generateBracket` liest jetzt den Status und schreibt `running` nicht mehr auf ein
   `finished`-Turnier (vorher kippte „Neu generieren" ein beendetes Turnier kommentarlos zurück).
6. Turnier-Übersicht warnt, wenn eingecheckte Spieler ohne Mannschaft existieren (genau die Zeilen,
   die kein Match bekommen) — bewusst nicht `anyCount > pCount`, das wäre bei Team-Turnieren
   Dauerfeuer.
7. **Migration `20260812090000_team_size_guard.sql` (angewandt):** `BEFORE UPDATE`-Trigger auf
   `tournaments`, SECURITY INVOKER, sperrt `team_size`-Änderungen sobald participants existieren;
   `postgres`/`service_role` bleiben als Reparatur-Tür offen. Der `ff71519`-Riegel lebte nur in
   TypeScript — PostgREST lag offen. Bewiesen in zurückgerollter Transaktion: unverändertes
   `team_size` passiert (jedes Formular schickt es mit), Änderung mit Teilnehmern → `23514`,
   Änderung ohne Teilnehmer erlaubt, postgres passiert.
8. `syncTeamReady`/`moveInto` aus `free-agent-actions.ts` in `[id]/team-sync.ts` gehoben (**ohne**
   `"use server"` — exportierte ungeschützte Helfer wären dort offene Server Actions) und
   `saveAssignments` zieht jetzt pro Ziel-Team die Spielbereitschaft nach — ohne das blieb ein per
   Zuordnung vollzählig gewordenes Team bei `checked_in_at NULL`, exakt der Team-Niki-Mechanismus.
   Restspieler-Panel rendert in beiden Zweigen (mit Hinweis, dass Zuordnungen erst nach dem
   Neu-Generieren im Spielplan landen).

⚠️ **Folge-Migration `20260812091000_referee_seed_on_reset.sql` (angewandt):** Fix 1 kollidierte mit
`guard_participant_protected_fields` — der Schiedsrichter darf nur `checked_in_at` ändern, `seed`
warf `insufficient_privilege`, womit **jeder Referee-Check-in-Reset** gescheitert wäre (vom
Implementierungs-Agenten an der Live-DB gefunden). Die Tür ist absichtlich schmal: `seed` darf sich
nur ändern, wenn er dabei NULL wird **und** die Zeile im selben UPDATE nicht (mehr) eingecheckt ist.
Bewiesen: Reset mit seed-NULL als Referee erlaubt, seed **setzen** → `42501`, seed nullen bei
bestehendem Check-in → `42501`, reiner Anwesenheits-Reset unverändert erlaubt.

**Turnier `8da58fae` bleibt datenseitig unangetastet** (bewusst): `finished`, 0 `match_reports`,
das eine Match wurde nie gespielt. Ein Backfill `player → solo` würde die Check-in-Audit-Zeile von
Team-Niki vernichten (`on delete cascade`, Zeile existiert, geprüft) und die Namen von ~10
überwiegend Minderjährigen anon-lesbar machen (`participants_select_public_board` filtert
`type <> 'player'`). Für ein beendetes Turnier ohne Ergebnisse kauft das nichts.

### Neu am 2026-08-11 (Nacht): Die vier Feature-Workstreams zum Vorfall — A/B/D/C

Plan „Team-Turnier-Fixes" (Grill-Interview mit Rene, alle Entscheidungen per Auswahlfrage
abgenommen). Vier parallele Ketten, jede nach dem **Dreifach-Prinzip** (Implementierer →
unabhängiger Prüfer → bei Mängeln separater Fixer → Endkontrolle; nie dieselbe Instanz zweimal):

**A — Nachmeldung kennt jetzt den Einzelspieler** (`add-participant-form.tsx`,
`participants/actions.ts`). Bei `team_size > 1` Umschalter „Team nachmelden" /
„Einzelspieler nachmelden"; der Einzelspieler wird `type='player'`, `team_id NULL`, sofort
eingecheckt — und kann optional **direkt** einem bestehenden Team zugeordnet werden (natives
Select mit Belegung `x/y`, nur unvollständige Teams, Kapazitätsprüfung auch serverseitig).
- ⚠️ **Reihenfolge in `addParticipant`: insert → check_in → moveInto → syncTeamReady.** Der
  Prüfer fand die Zuordnung VOR dem Check-in: schlug sie fehl (real für Rolle `referee`, deren
  Trigger nur `checked_in_at` erlaubt), blieb eine angelegte, nicht eingecheckte Geister-Zeile
  zurück und die Meldung verschwieg sie — der zweite Tresen-Versuch hätte eine Dublette erzeugt.
  Jede Fehlermeldung nach dem Insert sagt jetzt, was schon steht („… wurde angelegt und
  eingecheckt, aber …").
- Captain wird nur gesetzt, wenn das Zielteam leer war.

**B — „ohne Team" sichtbar + Zuordnung am Tresen** (`participants/page.tsx`, neu
`assign-team-select.tsx`, `checkin/page.tsx`). Jede Spieler-Zeile ohne Team trägt eine graue
Markierung (grau, nicht rot — zweiter Normalfall) und ein natives Auswahlfeld „→ Team zuordnen"
mit Belegung `x/y`; schreibt über das vorhandene `saveAssignments` (validiert, Captain-Hygiene,
`syncTeamReady`). Check-in-Liste: nur die Markierung, keine Zuordnungs-UI. Kein neues Query —
Zähler aus den ohnehin geladenen Zeilen.

**D — Generieren warnt namentlich** (`bracket/generate-button.tsx`, `bracket/page.tsx`, neu
`lib/bracket/generate-warning.ts` + Test). Der Dialog zeigt VOR dem Generieren: „Diese N
eingecheckten Spieler stehen in keiner Mannschaft und bekommen KEIN Match: …" und „Diese Teams
sind nicht spielbereit: …", mit Pflicht-Häkchen „Trotzdem generieren". Reine Warnung, kein Block
(Rene-Entscheidung: am Turniertag braucht Staff einen Ausweg). Wortlaut-Builder pure, getestet,
Muster `lostWork()`. Der Dialogtext verspricht den Statuswechsel nach `running` nicht mehr
bedingungslos (seit E5 bedingt).

**C — Kinder-Flow: Konsequenz + QR statt Tippen** (`register/team-step.tsx`, neu
`join-qr-card.tsx`, `register-client.tsx`, `register/page.tsx`). „Ohne Team weiter" sagt jetzt
unübersehbar: ohne Team kein Spiel, die Turnierleitung kann vor Ort zuteilen (kein Block — B/A
machen die Zuteilung ja möglich). Der Captain zeigt zusätzlich zum 6-Zeichen-Code einen **QR mit
`/t/<id>/register?join=<CODE>`** — jede Handy-Kamera reicht, kein In-App-Scanner. `register/page.tsx`
liest `searchParams.join` (async, Next 16), validiert gegen das Join-Code-Alphabet und füllt den
Beitritts-Pfad vor. Der Vorfüll-Hinweis erlischt, sobald der Code verbraucht oder verlassen wurde
(Prüfer-Fund: sonst log er nach Beitritt+Austritt weiter).

Alle vier Ketten mit FREIGABE der Endkontrolle; Polier-Runde für die letzten Minors (u. a.
Typfehler in `generate-button.test.tsx`: `vi.fn` ohne Signatur leitet parameterlos ab —
Signatur an den Mock, kein ts-ignore).

**Beweislage** (Commits `7c500ef` + `8c9b6cf`, beide live):
- Build grün, **573 Tests** grün (+39 neu gegenüber 534).
- **Kinder-Flow im echten Browser durchgespielt** (Agent, lokaler Dev-Server, Wegwerf-Turnier
  3v3): anmelden → Team gründen → QR wird gerendert (`aria-label="Beitritts-QR für Code …"`) →
  zweite Session ohne Cookies über `?join=GMRPWU` → Beitritts-Karte steht oben, Code
  vorbefüllt → Beitritt „2 von 3" → Austritt, und der Vorfüll-Hinweis ist danach **weg**.
- **Organizer-Screens am 2026-08-12 von Rene selbst durchgeklickt und bestätigt**: Nachmeldung
  mit Umschalter Team/Einzelspieler (inkl. Direkt-Zuordnung), „ohne Team"-Markierung plus
  Zuordnungsfeld in der Teilnehmerliste, namentliche Generieren-Warnung mit Pflicht-Häkchen,
  Seeding samt „Zufällig setzen" nach dem Generieren erreichbar, Warnzeile auf der
  Turnier-Übersicht. Damit hängt an dieser Runde kein ungeprüfter Klickweg mehr.

### Neu am 2026-08-12: §7.32-Fix + Mannschaftsaufstellungen sichtbar

**§7.32 behoben** (`519a57c`) — Details am Punkt selbst in §7.

**Aufstellungen sichtbar** (Rene-Beobachtung vom Team-Turnier: „man trägt Spielernamen ein, aber
die haben keine Verwendung"). Entscheidung Rene nach ausdrücklicher PII-Abwägung: **beides** —
Orga-Matchliste UND öffentlich.

- **Migration `20260812110000_team_rosters_public.sql` (angewandt, in zweiter Fassung):**
  `get_team_rosters(uuid)`, SECURITY DEFINER, liefert **genau** `(team_id, display_name,
  is_captain)` für `type='player'` mit Team — **und nur bei Turnieren mit `team_size > 1`**.
  ⚠️ **Die anon-Policy `participants_select_public_board` ist unangetastet** — bewusst eine
  schmale Funktion statt einer breiteren Policy: eine Policy entscheidet über Zeilen, nicht
  Spalten; die Funktion kann konstruktionsbedingt nie mehr als ihre drei Spalten liefern. Spieler
  **ohne** Team erscheinen nie (`team_id is not null`) — genau die Zeilen, die die Policy zum
  Schutz Minderjähriger zurückhält.
  ⚠️ **Der `team_size > 1`-Riegel kam erst durch den unabhängigen Prüfer** (Dreifach-Prinzip
  zahlt sich aus): die erste Fassung nahm jede Turnier-UUID und gab bei einem **Einzelturnier**
  mit verwaisten `player`-Zeilen (das Rocket-League-Vorfallsturnier!) eine Zeile heraus, die die
  Policy versteckt — der Schutz hing allein am `isTeam`-Check der Seite, ein direkter RPC-Aufruf
  umging ihn. Der Riegel sitzt jetzt IN der Funktion (Join auf `tournaments`); eine Funktion muss
  ihren eigenen Vertrag halten. Bewiesen als `anon` in zurückgerollten Transaktionen:
  Teamturnier exakt die Gegenzählung (19), Turnier mit 10 teamlosen `player` → vor dem Riegel 1,
  **nach dem Riegel 0**, unbekanntes Turnier leer.
- **Öffentliche Turnierseite** (`t/[tournamentId]/page.tsx`): neuer Abschnitt „Mannschaften"
  (nur Teamturniere) — Teamname + Zeile `Niki (C) · Anna · Tom`. Browser-verifiziert als anon
  am Duo-Turnier: alle 10 Teams mit Aufstellung.
- **Orga-Matchliste** (`matches/page.tsx` + `report-row.tsx`): unter „A vs B" je Seite
  `Team Alpha: Niki (C) · Anna` — eine Staff-Abfrage pro Turnier, entfällt bei `team_size <= 1`.
- Gemeinsamer purer Helper `lib/tournament/team-roster.ts` (`teamRosterLines`) + 5 Tests.
- Kette: Implementierer → Controller (Migration + anon-Beweise) → unabhängiger Prüfer →
  Browser-Beweis. Build grün, **578** Tests grün.

### Neu am 2026-08-12: e2e-Suite repariert — 29/29 grün (vorher 6)

Auslöser: §7.1 + §7.29. Kette nach Dreifach-Prinzip (Finder → Fixer-Agent → unabhängiger
Prüfer), alle Änderungen **nur in `web/e2e/`**, kein App-Code, keine Migration.

- **Wurzel von 14 der 17 roten Specs war EINE Zeile:** die Fixtures suchten das Spiel
  „Valorant", das seit dem DB-Wipe vom 2026-08-07 nicht mehr existiert. Jetzt
  `ensureFixtureGame()` in `fixtures.ts`: nimmt „E2E Game", legt es bei Bedarf selbst an
  (RLS `games_write_staff` erlaubt das). ⚠️ **`games(name)` hat KEINEN Unique-Constraint**
  (per SQL geprüft) — die Fixture liest deshalb Duplikat-tolerant (`order by created_at,
  limit 1` statt `maybeSingle`), sonst wäre ein einziges Doppel für jeden Lauf tödlich.
- **Drei Specs hingen an gestorbenen Produktionsdaten** und tun es jetzt nicht mehr:
  `tournament-detail` (griff sich das erstbeste offene Turnier — es gab keins mehr) und
  `organizer-checkin`/`organizer-participants` (klickten hartkodiert „Sommer Cup" im
  Dashboard — archiviert) laufen auf eigenen Wegwerf-Turnieren via `withFixtureTournament`;
  die Organizer-Specs legen sich per `registerAndCheckIn` einen Teilnehmer an, weil die
  Seiten bei 0 Teilnehmern nur den Leer-Hinweis rendern, keine Tabelle. `multi-tenant`
  lädt die Org dynamisch statt „eventpilot" zu erwarten.
- **`double-elim` hatte zwei eigene Ursachen:** (1) `generateBracket` macht für Double-Elim
  ~20 sequenzielle DB-Roundtrips und lief zusätzlich hinter dem `router.refresh()` der
  Seeding-Transition — 5s-Default-Erwartung riss; die Spec wartet jetzt auf den wieder
  aktiven Speichern-Knopf und gibt der Bracket-View 20 s. (2) Die Match-Karten-Zählung
  selektierte `rounded-[10px]`, `match-card.tsx` ist längst `rounded-[8px]` → Count 0.
- **Beweis:** kompletter Lauf 29/29 grün (2,4 min), Login-Konto `test@test.de` (Rolle
  admin, in `auth.users` verifiziert). ⚠️ Creds liefen als Shell-Env — **`web/.env.local`
  trägt noch die alten, ungültigen Werte** und ist für Agents schreibgesperrt; Rene muss
  `E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD` dort selbst nachziehen (§7.29).
- Nebenbei: 19 Müll-Dateien (0 Byte) aus dem Root gelöscht, drei davon frisch von heute
  09:00–09:15 — §7.15 bleibt offen, die Quelle produziert weiter.
- Nebenbefund fürs Protokoll (App-Code, bewusst nicht angefasst): `generateBracket` schickt
  die Winner-/Loser-Link-UPDATEs einzeln — ein Batch würde Sekunden sparen; und in den
  Dev-Server-Logs steht ein React-Hydration-Mismatch in `PushOptIn` (§7.36).

### Neu am 2026-08-12: Übernahme-Klickweg e2e-bewiesen (§7.19 + §7.20 + §7.23 zu)

Geplant per grill-me-Interview (drei Entscheidungen von Rene: e2e-Spec statt Einmal-Klick;
`allow_carry_over` bleibt dauerhaft AN, Spec erzwingt AN; Kernfall pur). Neu:
`web/e2e/carry-over.spec.ts` — ein Test, der „den einen Durchlauf, der zählt" fährt.

- **Scan ohne Kamera:** Token per `[data-scan-capture]`-Feld tippen + Enter (der dokumentierte
  Handscanner-Kanal, `use-hardware-scan.ts`). Vorher `localStorage["turnierapp.checkin.scanMode"]
  = "hardware"` per `addInitScript` — Hardware-Modus mountet die Kamera gar nicht, headless
  bleibt sauber.
- **Aufbau:** Ziel-Turnier via `withFixtureTournament`, Quell-Turnier via direktem
  `createFixtureTournament` + eigenem `afterAll` (das Helper-Paar kann nur ein Turnier je Datei);
  Quell-Teilnehmer mit Konto über `registerAndCheckIn`, das jetzt `qrToken` mitliefert
  (`.select("id, qr_token")` — Owner-RLS deckt das RETURNING).
- **Ablauf:** Scan → Karte „In dieses Turnier übernehmen?" → „Übernehmen & einchecken" →
  „Übernommen und eingecheckt" → **denselben Token nochmal** → Angebot erscheint WIEDER (kein
  „schon da", §7.38) → nochmal bestätigen → Staff-Client zählt: **exakt 1 Zeile** im Ziel,
  `checked_in_at` gesetzt.
- **Verifiziert:** Spec zweimal hintereinander grün (9,2 s / 6,3 s — zweiter Lauf beweist das
  Cleanup), DB-Gegenprobe 0 Reste (`E2E CarryOver%`-Turniere und -Teilnehmer), Gesamt-Suite
  30/30 grün.
- ⚠️ **Falle für Nachahmer:** `npx playwright` vom Repo-**Root** lädt mangels `node_modules`
  still die neueste Registry-Version herunter (1.62.x) — die behandelt Top-Level-`test.skip`
  strenger und meldet dann „No tests found". Immer aus `web/` laufen lassen; lokal ist ^1.61.

### Neu am 2026-08-12 (Nachmittag): Vollpass-Fix + Riegel-Spec + Storage-Putz

Dreierpaket, per grill-me geplant (Entscheidungen Rene: Fix beim Scan als „Vollpass"; Riegel-Spec
deckt beide Pfade; Skript committen UND Leck stopfen). Drei Commits, Details an den Punkten:

- **§7.38 behoben — „Alt-QR wird Vollpass"** (`scanner-client.tsx` + `carry-over.spec.ts`).
  Kette: Fixer-Agent → unabhängiger Review → Spec grün. Details §7.38.
- **§7.17 teilerledigt — `regenerate.spec.ts`**, zwei Tests. Der wichtige Erkundungsbefund
  vorweg: auf einer frisch geladenen Seite ist der Server-Riegel unerreichbar (der Knopf
  schickt `discardResults: true` aus den Server-Render-Zählungen mit) — er feuert nur im
  **Stale-Seiten-Race**, und genau das fährt Test 1 nach: Meldung landet per RPC, während die
  Seite offen ist → Server lehnt ab, nichts gelöscht. Test 2: Warntext → Abbrechen bewahrt →
  Bestätigen löscht (neue Match-Id, Reports cascade-weg). Zweimal grün. Details §7.17.
- **§7.3 erledigt — 45 Waisen gelöscht, Quelle gestopft.** Skript
  `web/scripts/cleanup-orphan-signatures.mjs` (`npm run cleanup:signatures`, `--dry`);
  Doppel-Beweis Skript ↔ SQL-Query (beide 45 → beide 0). Leck war die Suite selbst
  (`register-minor` malt echte Unterschriften, Cascade löscht nie Storage) — jetzt sammelt
  die Spec ihre Pfade in `afterEach` und löscht sie per Service-Role in `afterAll`;
  Folgelauf hinterlässt 0 neue Waisen. ⚠️ Lehrstück: die erste Fassung las erst im
  `afterAll` und verlor gegen das Turnier-Delete des Fixtures. Details §7.3.
- Nebenbei: vier neue 0-Byte-Müll-Dateien während der Subagent-Läufe entstanden und
  gelöscht (`(await`, `{,` um 12:45; `` `MIN_SCAN_LENGTH` ``-Muster) — stützt §7.15(d).

### Neu am 2026-08-12 (Abend): §7.17 komplett zu — Nachmeldung + Live-Steuerung e2e

Zwei Builder-Agents parallel, ein unabhängiger Reviewer, Läufe seriell. Suite jetzt **35/35**.

- **`nachmeldung.spec.ts`** (3v3-Fixture, zwei verkettete Tests): Team nachmelden mit 2 von 3
  (beweist §7.16-Formular UND den Blank-Zeilen-Filter, Liste `2 / 3`), dann Einzelspieler per
  Umschalter + „Direkt in Team"-Auswahl → `3 / 3`, Detailseite mit Captain-Chip, DB-Gegenprobe.
  Damit sind **beide August-Features** (Einzelspieler-Nachmeldung, Tresen-Zuordnung) erstmals
  im echten Browser bewiesen.
- **`live-control.spec.ts`**: die komplette Orga-Kette ohne Scorekeeper-Handy — Selbst steuern →
  Spiel starten → 2:1 zählen (Seiten-Mapping vorab per `getSingleFinal`, deterministisch) →
  Spiel beenden → `page.reload()` (Pflicht: Freigabe-Vorschlag füllt nur beim Mount) →
  Freigeben → „2:1 · Sieger: …". Erste Abdeckung überhaupt für LiveControl/LiveScoreControl/
  ConfirmForm als gerenderte Artefakte (Komponententests existieren dort nicht).
- **Encoding-Bug im Vorbeigehen gefixt:** das Plus-Button-aria-label in
  `live-score-control.tsx:85` hieß wörtlich `ein Tor hinzuf?gen` (literales `?`, Byte 0x3F,
  statt `ü`) — Screenreader lasen Müll. Ein Zeichen, im selben Commit; die Spec pinnt das
  korrekte Label. Reviewer-Befund zum `describe.configure({mode:"serial"})` geprüft und
  verworfen (Playwright erlaubt das auf Dateiebene; serial überspringt Folgetests nach Rot).
- Wieder eine Müll-Datei während der Builder-Läufe (`p.is_captain)`, 17:07) — §7.15(d)-Muster.

### Neu am 2026-08-12 (Nacht): Gerätetest-Runde — §7.4, §7.21, §7.25, §7.26 alle zu

Die vier Punkte, die echte Hardware brauchten, in einer Sitzung erledigt: Ich habe zwei
Test-Turniere plus ein echtes Referee-Konto vorbereitet und die Orga-Seite selbst gefahren
(Browser-Pane), Rene hat Handy und Tablet bedient. Ergebnisse an den Punkten selbst; hier
die vier Erkenntnisse, die man nicht im Code sieht:

- **iOS-Push braucht die installierte Web-App** — im Safari-Tab existiert die Opt-in-Karte
  gar nicht, und im Privatmodus überlebt das Abo nicht (§7.4a/b).
- **Push zielt auf Match-Teilnehmer, nicht auf Abonnenten** — wer in keinem spielbaren Match
  steht, bekommt nichts, egal wie gut das Abo ist (§7.4c). Kostete hier drei Fehlversuche.
- **Der Teams-Screen ist ein Entwurf mit Speichern-Knopf** — Ziehen ohne Speichern sieht aus
  wie ein Bug, ist aber Absicht (§7.25).
- **Ein direkt angelegter Referee braucht `profiles.org_id`**, sonst blockt jede org-gescopte
  Prüfung (§7.21).

Test-Turniere „Gerätetest 3v3" (`13955a82`) und „Gerätetest Solo" (`e48da12c`) stehen noch —
löschbar, sobald Rene sie nicht mehr braucht. Das Referee-Konto bleibt.

### Neu am 2026-08-12 (Abend, 3. Runde): §7.2 + §7.28 zu — Magic-Link cross-device, Geburtsdatum-Lockdown

Details an den Punkten selbst; hier die Kette und die Lehrstücke:

- **§7.2 (Magic Link):** Kette Erkundung → „null Code nötig" (Route war typ-agnostisch,
  Geräte-Kopplung fuhr die Linkform längst) → Renes Dashboard-Edit landete im FALSCHEN
  Template (Confirm signup) → mit Renes Freigabe des vorhandenen `sbp_`-Tokens beide
  Templates per **Management-API** repariert → Testmail → Linkform-Beweis im Resend-Log →
  **Fremdbrowser-Beweis komplett agentisch** (sessionloser Browser-Pane → eingeloggt auf
  `/organizer`). Neuer Arbeitsmodus: Auth-Config (Templates, Schalter) kann der Agent jetzt
  selbst setzen — Token liegt in `.mcp.json`, wird nie ausgegeben.
- **§7.28 (Lockdown):** Kette Builder (mit dem No-op-Fang) → Review (null Befunde) →
  Migration von mir angewandt → **beim Beweisen das anon-Default-Grant-Loch gefunden und
  geschlossen** → alle Rollen-Beweise in zurückgerollten Transaktionen → Suite. ⚠️ Der
  erste Suite-Lauf direkt danach war 4× rot (groups-playoffs, nachmeldung#2) — Ursache
  waren Reste eines parallel-belasteten, abgewürgten Laufs, NICHT der Lockdown; auf idler
  Maschine 35/35 grün. Merksatz: Suite-Läufe nie parallel zu Mail-/API-/Browser-Arbeit.
- Nebenbei zwei verwaiste Agent-Worktrees unter `.claude/worktrees/` gefunden
  (hungry-thompson: sauber, Stand 10.08.; competent-lamarr: unregistriert, enthielt NUR
  drei 0-Byte-Müll-Dateien vom 11.08. 19:06 mit denselben Namen wie der Root-Müll vom
  12.08. 09:15 — §7.15-Datenpunkt: der Erzeuger schreibt identische Textfragmente an
  verschiedene Orte). Aufräumen (worktree remove + rm) liegt bei Rene, Kommandos im Chat.

### Neu am 2026-08-12 (Abend, 2. Runde): §7.36 + §7.37 behoben

Kleinpaket, beide Funde aus der heutigen e2e-Offensive. Builder-Agent → unabhängiger Review
(null Befunde) → Gates. Details an den Punkten selbst (§7.36: `useSyncExternalStore`-Gate
gegen den Hydration-Mismatch; §7.37: Bracket in EINEM INSERT via vorab erzeugter Ids).
580 Unit-Tests (578 + 2 neue), Build grün, alle Bracket-konsumierenden e2e grün
(double-elim, regenerate, live-board, results-flow), Gesamt-Suite 35/35, Dev-Log ohne
Hydration-Meldung.

## 6. Architektur-Kernpunkte (NICHT übersehen)
- ⚠️ **Wer antritt, entscheidet `participants.type` — NIEMALS `team_id`.** Wettkämpfer =
  `type in ('solo','team')`, Mensch = `type in ('solo','player')`. Ein `player` ohne Team trägt
  `team_id` NULL und ist trotzdem kein Wettkämpfer. Konstanten: `COMPETITOR_TYPES` / `PERSON_TYPES`
  in `web/src/app/organizer/tournaments/[id]/participants/participant-types.ts` — **benutzen, nicht
  neu erfinden.** Die Bracket-Quelle filtert an **zwei** Stellen (`saveSeeds` UND `generateBracket`);
  ergänzt man nur eine, meldet das Speichern „Ungültiger oder nicht eingecheckter Teilnehmer". Als
  Netz darunter: `trg_matches_guard_competitors` bricht laut ab, wenn eine Person in einem Match-Slot
  landet — lieber ein Fehler als ein stiller, falscher Turnierbaum.
- ⚠️ **Mensch → Wettkämpfer löst man überall gleich auf: `coalesce(team_id, id)`.** Beim Einzelstarter
  die eigene Zeile, beim Teammitglied die seines Teams. So machen es `report_match`,
  `report_match_via_token`, `get_open_match_by_qr_token`, `start_match_as_player`,
  `match_reports_select` und `/me`. Wer die Person-Id direkt gegen `matches` hält, bekommt bei einem
  Teamturnier **nichts** — kein Fehler, nur eine leere Seite.
- ⚠️ **`type` ist beim INSERT abgeleitet und danach eingefroren.** Der Guard-Trigger erzwingt
  `team_size > 1 ? 'player' : 'solo'`. **Das Ändern von `tournaments.team_size` rechnet bestehende
  Anmeldungen NICHT um** → siehe §7, Punkt 24.
- **Multi-Tenant-Isolation:** `profiles.org_id` + `tournaments.org_id` + `public.current_org_id()` (SECURITY DEFINER). Staff-Write-RLS ist `is_staff() AND <org = current_org_id()>`. **Turnier-SELECT bleibt public**. `games` bleiben **global**. Organizer-Seiten 404'en fremde Turniere via `requireOrgTournament`.
- **⚠️ SECURITY-DEFINER-RPCs umgehen RLS** → brauchen EXPLIZITE Guards. Neue schreibende Definer-RPCs: **immer `is_staff()`/`is_admin()` UND Org-Check**. Bei `my_sessions()`/`revoke_session()` ist die `auth.uid()`-Bedingung die Autorisierung — nicht entfernen.
- **PII-Modell:** `anon` hat nur Spalten-GRANT auf `participants(id, tournament_id, display_name)`. Öffentliche Seiten lesen über **`createPublicClient()`**.
- ⚠️ **`createPublicClient()` ist `async` und ruft `await connection()`.** Jede öffentliche Seite MUSS `await createPublicClient()` schreiben. Ohne das friert Next die Seite beim Build ein und Produktion zeigt den Datenstand vom letzten Deploy (genau dieser Bug war live).
- ⚠️ **Datum/Zeit immer über `@/lib/format-date`**, nie roh `toLocaleString`. Ohne fixe Zeitzone rendert der Server in UTC (Vercel) → Zeiten 2 h falsch, und in Client-Komponenten bricht React die Hydration ab (#418), wodurch die Komponente **keine Klick-Handler** mehr anhängt. Genau so war „Handy verbinden" auf Prod tot, während es lokal lief.
- **Auth-Flows:** `/auth/confirm` behandelt **beides** — `?code=` (PKCE, Standard bei `@supabase/ssr`) und `?token_hash=` (Geräte-Kopplung UND seit dem 2026-08-12 die Magic-Link-Mail). Das Magic-Link-Template steht auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` → **Magic Links öffnen cross-device** (§7.2, end-to-end bewiesen). ⚠️ Frühere Fassungen dieser Zeile begründeten das Nicht-cross-device mit „PKCE ist an den Browser gebunden" — halbrichtig: das Präfix band nur den `?code=`-Pfad, `verifyOtp` mit `token_hash` braucht keinen Verifier. Der Grund war allein die Linkform.
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
1. ✅ **Erledigt (2026-08-12): Suite läuft 29/29 grün.** Genau die unten empfohlene Umstellung
   ist passiert — alle Specs, die sich fremde Produktionsdaten griffen (offenes Turnier,
   „Sommer Cup"-Link, Org „eventpilot", Spiel „Valorant"), legen ihre Fixtures jetzt selbst an.
   Details im §5-Changelog „e2e-Suite repariert". Historie:
   **e2e am 2026-08-10 ausgeführt — 19 von 28 rot, beide Ursachen liegen NICHT im Code:**
   (a) **Kein Turnier steht mehr auf `registration`.** Vier Specs (`register-*`, `checkin-*`) greifen
   sich per `.eq("status","registration").limit(1).single()` das erstbeste offene Turnier; gibt es
   keins, sterben sie mit *„Cannot coerce the result to a single JSON object"*, und „Sommer Cup 2026"
   ist zusätzlich archiviert. (b) **`E2E_ORG_PASSWORD` in `web/.env.local` ist veraltet** —
   `login.spec` bleibt nach dem Absenden auf `/login` stehen, was nach dem heutigen Passwort-Reset
   plausibel ist. Alles, was einen Organizer-Login braucht, hängt daran.
   **Gegenprobe:** mit einem eigens angelegten offenen Wegwerf-Turnier liefen die vier geänderten
   Specs **5/5 grün** (register-solo, register-minor ×2, checkin-online, checkin-station); das
   Turnier wurde danach gelöscht, 0 `E2E %`-Teilnehmer blieben zurück.
   ⚠️ **Die vier Specs sollten sich ihr Turnier selbst anlegen** wie die Fixture-Specs
   (`e2e/fixtures.ts`), statt sich fremde Produktionsdaten zu greifen — solange sie das nicht tun,
   ist die Suite bei jedem echten Turnierende rot **und** sie schreibt Testteilnehmer in ein
   laufendes Event.
2. ✅ **Erledigt (2026-08-12): Magic Link ist cross-device.** Kernbefund der Erkundung: **null
   Code-Änderung nötig** — `/auth/confirm` war schon typ-agnostisch, und die Form
   `token_hash + type=magiclink` fuhr die Geräte-Kopplung täglich in Produktion. Die gesamte
   Umstellung war das Mail-Template. ⚠️ **Lehrstück dabei:** Renes Dashboard-Edit landete
   zuerst im *Confirm-signup*-Template (per Management-API-GET aufgedeckt:
   `confirmation_content` trug das Magic-Link-HTML, `magic_link_content` war noch Default).
   Beides per Management-API repariert — seit Rene den vorhandenen `sbp_`-Token (aus
   `.mcp.json`, wird nie ausgegeben) freigegeben hat, kann der Agent Auth-Config selbst
   setzen: Magic-Link-Template auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
   (deutscher Text, Betreff „Dein Anmelde-Link — Turnier-App"), Signup-Template zurück auf
   Supabase-Default. **End-to-end bewiesen, komplett agentisch:** Testmail ausgelöst →
   Resend-Log `sent`, Linkform `token_hash=…&type=magiclink` direkt auf die App-Domain →
   Link im sessionlosen Browser-Pane geöffnet → „EINGELOGGT ALS ORGANIZER" auf `/organizer`.
   Historie (bleibt wichtig): das `pkce_`-Präfix band nur den `?code=`-Pfad; `verifyOtp`
   mit `token_hash` braucht keinen Verifier — der Cross-Device-Blocker war allein die Linkform.
3. ✅ **Erledigt (2026-08-12): 45 verwaiste Unterschriften gelöscht, Leck gestopft.** Aus den 39
   waren inzwischen 45 geworden — die Quelle war die e2e-Suite selbst: `register-minor` malt pro
   Lauf eine echte Unterschrift, das Turnier-Delete des Fixtures cascadet nur DB-Zeilen, nie
   Storage-Objekte, und der Bucket hat **keine** DELETE-Policy (nur Service-Role kann löschen).
   Zwei Maßnahmen: (a) `web/scripts/cleanup-orphan-signatures.mjs` (`npm run cleanup:signatures`,
   `--dry` zum Zählen) löscht Objekte ohne `consents.signature_path`-Zeile per Service-Role —
   ausgeführt, Skript-Zählung und die alte Prüfquery sagten unabhängig voneinander 45, danach
   beide 0; (b) `register-minor.spec` sammelt seine Signatur-Pfade **pro Test in `afterEach`**
   (da existieren die consents-Zeilen garantiert noch) und löscht sie in `afterAll` per
   Service-Role — bewiesen: Lauf danach hinterlässt 0 neue Waisen. ⚠️ Erste Fassung las die
   Pfade erst im `afterAll` und verlor gegen das Turnier-Delete des Fixtures — bei
   Hook-Reihenfolgen nicht auf LIFO-Annahmen bauen, sondern einsammeln, solange die Daten
   sicher leben. `SUPABASE_SERVICE_ROLE_KEY` steht jetzt auch in `web/.env.example`.
   Alte Prüfquery bleibt gültig: `select count(*) from storage.objects o where bucket_id='consent-signatures' and not exists (select 1 from consents c where c.signature_path = o.name);`
4. ✅ **Erledigt (2026-08-12): Push kam auf Renes iPhone 13 Pro an**, aus der App heraus
   („Dein Match ist bereit", zwei Geräte-Abos gleichzeitig bedient, Meldung „2
   Benachrichtigung(en) gesendet"). ⚠️ **Drei Dinge, die den Test fast als „kaputt"
   abgestempelt hätten, alle keine Bugs:**
   (a) **iOS zeigt die Opt-in-Karte nur in der installierten Web-App.** Im normalen
   Safari-Tab kennt der Browser kein `PushManager`, `pushSupported()` ist false, die Karte
   rendert gar nicht. Teilen → „Zum Home-Bildschirm" → **von dort** öffnen ist Pflicht.
   (b) **Privater Modus killt das Abo** — es stand zwar in `push_subscriptions`, Zustellung
   kam nie an. Nach Neuinstallation aus einem normalen Tab lief es sofort.
   (c) **Der Versand geht nur an Teilnehmer, die in einem spielbaren Match stehen**
   (`participantsToNotify`, beide Slots gefüllt, pending/live). Ein Abo allein reicht nicht —
   die ersten Klicks liefen ins Leere, weil das Testgerät noch keinem Match zugeordnet war.
   Der Versand ist außerdem **manuell**: Orga-Knopf „Spielbare Matches benachrichtigen".
   Diagnose-Werkzeug für den nächsten Zweifelsfall: ein Node-Skript mit `web-push` und dem
   Endpoint aus der DB direkt an Apple senden — Antwort `201` beweist, dass Keys und Abo
   stimmen und der Fehler woanders liegt (genau so wurde hier eingekreist).
5. ✅ **Erledigt (2026-08-12): Migrations-Timestamp-Kollision behoben.** ⚠️ Die alte Fassung
   dieser Zeile nannte `20260628090000` als Duplikat — **stimmte nicht mehr**, nachgemessen:
   dieser Stamp existiert nur einmal (`fix_participant_read_leak.sql`). Die echte Kollision
   war `20260810140000` ×2 (die aus §5 dokumentierte Parallel-Session-Kollision);
   `team_members_insert_staff.sql` heißt jetzt `20260810143000_…` (git mv, Inhalt unberührt,
   NICHT neu angewandt). Gefahrlos, doppelt geprüft: `supabase_migrations.schema_migrations`
   führt eigene MCP-Timestamps (z.B. `20260811074650`), Dateinamen sind dort nie referenziert.
   Danach 0 Duplikate über alle Migrationsdateien.
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
14. ✅ **Doppelter Accessible-Name in `consent-step.tsx` behoben** (2026-08-10): `aria-label` entfernt,
    das umschließende `<Label>` benennt die Checkbox jetzt allein. Angesagt wird damit der Wortlaut der
    Fotoerlaubnis selbst statt „Fotoerlaubnis erteilen" plus derselbe Satz. Gleicher Handgriff wie im
    `save-access-dialog`, gleicher Kommentar. **Erstmals mit Test** (`consent-step.test.tsx`, vorher gab
    es für `PhotoConsentStep` gar keinen): er pinnt den berechneten Namen **exakt** gegen
    `photoConsentText(...)` — ein Teilstring-Match liefe mit dem Stottern weiterhin grün, weil der
    doppelte Name den Satz enthält. Gegenprobe gemacht: mit wieder eingesetztem `aria-label` fällt er um.
15. ✅ **Müll-Dateien gelöscht** (2026-08-10): `'`, `(,`, `0)`, `1`, `m.status`, `usage`, `void`, `{,`,
    `web/'`, `web/ACHTUNG`, `web/{,+` — alle 0 Byte, nie im Index, `git status` ist wieder leer.

    ⚠️ **Diese Zeile behauptete zuerst, `git add` mit Pfaden wie `t/[tournamentId]/…` sei die Ursache
    und brauche `git --literal-pathspecs`. Beides ist falsch, nachgemessen:** `git ls-files` findet den
    Bracket-Pfad mit und ohne das Flag gleich gut (Git probiert den literalen Treffer, und die Datei
    heißt nun mal so), und `git add` kann grundsätzlich keine Dateien anlegen — es findet höchstens
    nichts. Wer der alten Fassung folgt, schleppt ein wirkungsloses Flag mit und sucht an der falschen
    Stelle.

    Die echte Ursache ist **nicht belegt**. Die Namen sind Bruchstücke von Kommandotext (`m.status`,
    `(,`, `0)` stammen erkennbar aus SQL, `ACHTUNG` aus deutscher Prosa), also mehrzeiliger Text, der
    in einer Shell landete und dort mit `>` oder Brace-Expansion Dateien erzeugte. Mehrere Sessions
    liefen parallel; welche es war, lässt sich nachträglich nicht sagen. **Nicht raten** — die
    Gegenmaßnahmen stehen ohnehin schon in §4: `git status` nach jedem Workflow, und Temporärdateien
    gehören ins Scratchpad, nie ins Repo.

    **Nachtrag am selben Abend: es kamen zehn neue nach** (`'`, `(,`, `{,`, `0)`, `1`, `m.status`,
    `web/'`, `web/)`, `` web/1` ``, `web/ACHTUNG`), zwei davon innerhalb weniger Minuten. Alle
    gelöscht, jeweils einzeln auf „existiert, ist Datei, ist leer" geprüft, Quelldateiendungen
    grundsätzlich ausgenommen. **Die Quelle produziert also weiter** — die Ursache ist damit weiter
    offen, nicht erledigt. ⚠️ **`usage` liegt entgegen der Liste oben wieder (oder noch) da**, 0 Byte,
    Zeitstempel 12:12; bewusst stehen gelassen, weil der Name als Platzhalter gemeint sein könnte und
    er nicht nach Kommandobruchstück aussieht.

    **Zweiter Nachtrag, 2026-08-10 abends — zwei Befunde, die die Suche verengen.**

    (a) **`git status` findet strukturell nicht alle.** `design-refs/s.trim()` liegt seit dem
    **2026-06-16, 23:27** da, 0 Byte, Name eindeutig ein Code-Bruchstück — im selben Minutentakt wie
    die `*.extracted.html` daneben. Nie in einer Liste aufgetaucht, weil `.gitignore:42` das ganze
    Verzeichnis ausblendet. Damit ist zweierlei falsch an der bisherigen Fassung: das Phänomen ist
    **zwei Monate älter** als angenommen, und die empfohlene Gegenmaßnahme („`git status` nach jedem
    Workflow") kann es prinzipiell nicht vollständig sehen. Wer wirklich sucht, nimmt
    `find . -maxdepth 2 -type f -size 0 -not -path './.git/*' -not -path '*/node_modules/*'`.
    Die Datei wurde **stehen gelassen** — ignoriertes Verzeichnis mit fremden Referenzdateien.

    (b) **Ein neuer Fund, eine naheliegende Spur — und zwei Versuche, die sie nicht bestätigen.**
    Während der Doku-Arbeit entstand `` web/1900-01-01` `` (0 Byte, 20:07:45), gelöscht. Die
    Zeichenfolge `1900-01-01` stand in genau einem Text dieser Minute: der Ergänzung zu §7.18, dort
    **in Backticks** als `` `>= 1900-01-01` ``. Kein Shell-Kommando der Sitzung enthielt sie. Das legte
    nahe, dass Dateiinhalt irgendwo durch eine Shell läuft, wo Backticks Kommandosubstitution und `>`
    eine Umleitung auslösen — was zu den Altfunden passt, die alle Bruchstücke von *geschriebenem Text*
    sind (`m.status`, `(,`, `ACHTUNG`), nicht von Kommandos.

    ⚠️ **Zwei gezielte Reproduktionsversuche sind gescheitert:** (1) neue Datei mit Backticks,
    Umleitungszeichen und Sentinel-Token ins Scratchpad **geschrieben**, (2) eine Repo-Markdown-Datei
    mit demselben Muster **editiert** — danach jeweils sofort `find -size 0`: keine neue Datei, kein
    Sentinel. **Die Spur ist damit eine Korrelation, keine Ursache.** Entweder braucht der Auslöser
    noch etwas, das in den Versuchen fehlte, oder der Erzeuger ist ein anderer Prozess und die zeitliche
    Nähe war Zufall. **Bitte nicht als geklärt weitertragen** — das ist genau der Fehler, den §10 dieser
    Datei als teuerste Angewohnheit nennt. Was bleibt und belastbar ist: der Fund selbst, dass er
    weitergeht, und die Detektionsmethode aus (a).

    **(c) Dritter Nachtrag — die zweite Sitzung ist nachgewiesen, und damit fällt die Erklärung
    „eigenes Werkzeug" weitgehend weg.** Kurz darauf lagen drei weitere 0-Byte-Dateien im Repo-Root:
    `` 1` `` (20:36), `0` (20:38) und `` (`6e3e21c`…`015b759` `` (20:39). Die dritte ist **wörtlich
    Zeile 8 dieser Datei bzw. von FORTSCHRITT.md** — Text, den in dieser Minute niemand geschrieben,
    sondern nur *gelesen* hat. Im selben Moment standen zwei Quelldateien geändert im Arbeitsbaum, die
    aus dieser Sitzung nicht stammen konnten (`participants/page.tsx` und `participants/[pid]/page.tsx`,
    inhaltlich eine fertige Aufstellungs-Anzeige). **Es lief also nachweislich eine zweite Sitzung im
    selben Arbeitsbaum** — wie schon am Vormittag, siehe die Notiz am Kopf von FORTSCHRITT.md.

    Damit ordnet sich alles: die eigenen Repro-Versuche mussten scheitern, weil der Erzeuger ein
    **anderer Prozess** ist. Wer die Ursache wirklich einkreisen will, braucht deshalb den Zeitstempel
    **und** die Frage, welche Sitzung gerade lief — `find -size 0 -newermt '-2 minutes'` neben
    `git status`, und zwar in **beiden** Sitzungen. ⚠️ **Und die praktische Konsequenz, die wichtiger ist
    als die Ursache:** wer hier committet, muss `git add` mit expliziten Pfaden benutzen und vorher
    `git status` lesen — sonst reißt man die halbfertige Arbeit der anderen Sitzung mit hinein.

    **(d) Vierter Nachtrag, 2026-08-12 — der Kreis wird enger: SUBAGENTS derselben Sitzung.**
    Morgens 19 Stück gelöscht (drei frisch von 09:00–09:15). Mittags entstand `` `MIN_SCAN_LENGTH` ``
    (0 Byte, 12:22:49, Backticks IM Dateinamen) — die Zeichenfolge steht wörtlich, in Backticks,
    im Bericht des Explore-Subagents, der **in genau diesem Moment in dieser Sitzung** lief. Keine
    zweite Sitzung nötig: der Erzeuger sitzt (auch) in den eigenen Hintergrund-Agents — passt zu (c),
    „anderer Prozess" schließt die eigenen Subagents ein. Muster bestätigt: es sind Bruchstücke von
    *berichtetem/gelesenem* Text, der irgendwo durch eine Shell läuft. Gegenmaßnahme unverändert
    (find-Kommando aus (a) + explizite `git add`-Pfade); Ursache im Tooling weiter offen.

    **(e) Fünfter Nachtrag, 2026-08-12 abends — die heiße Spur: der cmd/c-gewrappte Bash-Hook.**
    Bei §7.2/§7.28 kamen weitere 0-Byte-Dateien mit Namen wie `setMounted(true)`,
    `k.includes('mailer')`, `(supabase`, `p.is_captain)` — **allesamt wörtliche Fragmente von
    Bash-Command-Strings dieser Session** (JS aus `node --input-type=module -e`, Kommentare,
    Grep-Muster), entstanden im Moment der Bash-Ausführung. `.claude/settings.json` verdrahtet
    auf **jeden Bash-Aufruf** einen `PreToolUse`- und `PostToolUse`-Hook, gewrappt in
    `cmd /c "IF EXIST … (node … pre-bash) ELSE (node … pre-bash)"`. Der Node-Handler
    (`.claude/helpers/hook-handler.cjs`, `pre-bash`/`post-bash`) liest nur `stdin`/`hookInput`
    und schreibt **nichts** — geprüft. Verdacht liegt also auf der **`cmd /c`-Schicht** unter
    Windows: läuft der Command-Text dort durch eine Ebene, die `(`, `)`, Backtick, `>` als
    cmd-Syntax (Gruppierung/Redirect) deutet, erzeugen genau solche Fragmente leere Dateien im
    CWD. ⚠️ **Nicht bewiesen, welche Ebene genau** — der Node-Handler ist es nachweislich nicht,
    aber die Kette cmd/c → IF/ELSE-Klammern ist der plausibelste verbleibende Ort. **Nicht als
    geklärt weitertragen** (§10). Belastbar neu: die Namen sind Fragmente **eigener
    Bash-Commands**, nicht von gelesenem Doku-Text — das verschiebt die Ursache von „Subagent
    liest Prosa" zu „Bash-Command-Verarbeitung unter cmd/c". Wer es lösen will: die Hooks sind
    Tooling (`.claude/`, untracked, Ruflo) — testweise den `cmd /c`-Wrapper durch direkten
    `node`-Aufruf ersetzen und prüfen, ob der Müll aufhört; ODER den PreToolUse-Bash-Hook
    temporär entfernen und dasselbe messen.
16. ✅ **Erledigt (2026-08-12): das Aufstellungs-Formular ist im Browser gelaufen** — e2e
    `web/e2e/nachmeldung.spec.ts` auf einem 3v3-Fixture: Formular zeigt `Aufstellung · 3v3` mit
    genau den drei Zeilen (Captain, Spieler 2, Spieler 3 — und keiner vierten), Team mit 2 von 3
    angelegt (leere Zeile gefiltert, Liste `2 / 3`), dann Einzelspieler per Umschalter + „Direkt
    in Team" dazu → Liste `3 / 3`, Detailseite: drei Spieler, genau ein Captain-Chip;
    DB-Gegenprobe 1× team + 3× player mit team_id, genau ein is_captain. Login-Blockade war mit
    den e2e-Creds (§7.29) gefallen.
17. 🟡 **Teilweise erledigt (2026-08-12): der Regenerate-Riegel hat jetzt seine Spec** —
    `web/e2e/regenerate.spec.ts`, zwei Tests: (1) das **Stale-Seiten-Race**, der einzige Weg, auf
    dem der Server-Riegel im Browser überhaupt feuert (eine frisch geladene Seite schickt bei
    vorhandener Arbeit `discardResults: true` gleich mit — der Knopf rechnet aus dem
    Server-Render): Seite offen bei leerem Bracket, Spielermeldung landet nebenher per RPC,
    Bestätigen → Server lehnt ab („bitte ausdrücklich bestätigen"), nichts gelöscht; (2) der
    Warn-Dialog-Weg: Reload → `lostWork()`-Wortlaut inline sichtbar → Abbrechen bewahrt →
    Bestätigen löscht wirklich (neue Match-Id, `match_reports` der alten per Cascade weg).
    Billigste Verlust-Sorte fürs Fixture: pending-Match + **eine** Spielermeldung
    (`report_match` fasst `matches.status` nie an).
    **Komplett zu seit dem 2026-08-12 (Abend):** auch Nachmeldung und Live-Steuerung haben
    ihre Specs — `nachmeldung.spec.ts` (zwei Tests, 3v3, erledigt §7.16 mit) und
    `live-control.spec.ts` (eine Kette: Selbst steuern → Spiel starten → zählen → Spiel
    beenden → Reload → Scorekeeper-Vorschlag vorbefüllt → Freigeben → „2:1 · Sieger: …",
    Live-Control verschwindet). ⚠️ Zwei Fallen für Nachahmer stehen als Kommentare in der
    Spec: der Freigabe-Vorschlag füllt die Felder nur beim MOUNT (nach „Spiel beenden" ist
    ein `page.reload()` Pflicht, sonst „Bitte gib zwei gültige Punktzahlen ein."), und der
    Text „Scorekeeper" existiert doppelt auf der Seite (QR-Block + SectionLabel) — nie
    unscoped matchen.
18. ✅ **Geburtsdatum-Prüfung vereinheitlicht** (2026-08-10). Die öffentliche Anmeldung ruft jetzt
    `validBirthdate()` (`lib/consent.ts`) auf — dieselbe Funktion wie der Nachmelde-Pfad, mit
    demselben Satz bei Fehlschlag — und `participants.birthdate` trägt einen CHECK
    (`>= 1900-01-01`, `<= current_date`, Migration `20260810160000`).

    ⚠️ **Diese Zeile behauptete vorher, die öffentliche Anmeldung nehme Geburtsdaten aus der Zukunft,
    und führte Teilnehmer „Moritz b." mit `2026-07-10` als Beleg. Beides ist falsch, nachgemessen:**
    die handgeschriebene `refine()` in `register-client.tsx` lehnt Zukunftsdaten seit `1bbcfe4` ab,
    dem allerersten Anmelde-Commit; und jenes Datum lag am Tag des Eintrags bereits in der
    Vergangenheit (`birthdate > created_at::date` traf auf keine einzige der 21 Zeilen). Es sieht nur
    aus der Gegenwart heraus wie Zukunft. Wer der alten Fassung folgt, sucht einen Bug, den es nie gab.

    Der echte Mangel war ein anderer und stand nirgends: die Kopie prüfte **weniger** als das Original
    (Jahr < 1900 ging durch; der Kalender-Rollover `2013-02-31` fängt ohnehin Postgres selbst mit
    `22008` ab), und sie ist ohnehin nur Kosmetik — **die öffentliche Anmeldung hat keine
    Server-Action**, `onSubmit` schreibt mit dem Anon-Key direkt in `participants`. Deshalb der CHECK:
    er ist die einzige Stelle, die ein von Hand abgesetztes POST nicht umgeht. ⚠️ `current_date` in
    einem CHECK ist zulässig **und hier unbedenklich, weil die Schranke nur nach vorne wandert** —
    Begründung und die beiden offen gelassenen Restränder stehen im Kopf der Migration.

16. **Fotoerlaubnis — was bewusst fehlt** (siehe §5): **kein Widerruf in der App**, **kein
    Nachtragen** (weder auf `/me` noch am Check-in-Tresen, wenn jemand vor Ort das Papier
    unterschreibt) und **kein Sammel-Export** außer dem Ausdruck. Alles drei war beim Bau
    explizit abgewählt, nicht vergessen.

    ⚠️ **Entscheidung Rene, 2026-08-12: der Widerruf-Knopf wird NICHT gebaut — Punkt
    gestrichen, nicht vertagt.** Frühere Fassungen nannten ihn „den nächsten ehrlichen
    Handgriff"; das ist zurückgenommen. Begründung: ein Selbstbedienungs-Knopf verspricht
    etwas, das die Realität nicht einlöst. Sind Flyer, Plakate oder Social-Posts einmal
    produziert, holt sie kein Datenbank-Flag zurück; ein Klick, der so aussieht, als
    verschwänden die Fotos, wäre irreführender als gar kein Klick. Der Widerruf läuft
    stattdessen **schriftlich beim Veranstalter** und wird dort von Hand abgearbeitet.

    Zur sauberen Einordnung, damit das später niemand falsch weiterträgt (keine
    Rechtsberatung): Das Widerrufsrecht selbst *besteht* natürlich weiter — es muss nur
    keine App-Funktion sein, ein formloser Weg zum Veranstalter genügt. Und ein Widerruf
    wirkt **ab jetzt**, nicht rückwirkend: bereits gedrucktes Material muss nicht
    eingesammelt werden, künftige Verwendung unterbleibt. Genau deshalb passt der
    schriftliche Weg besser als ein Knopf. Was die App weiterhin leistet: sie zeigt an, ob
    eine Erlaubnis vorliegt (blauer Chip), und druckt den Nachweis mit dem damals
    zugestimmten Wortlaut aus — das ist die Grundlage, auf der ein schriftlicher Widerruf
    überhaupt bearbeitet werden kann.
17. **Vier alte `consents`-Zeilen ohne Anschrift und Wortlaut** (erteilt vor dem 2026-08-10, im
    EA-Sports-Turnier: Linus Augsten, Maxi, Nico, Supermats1). Der Ausdruck zeigt für sie „wohnhaft —"
    und den Alt-Satz. Nicht nachträglich auffüllen — was nicht erhoben wurde, wurde nicht erhoben.

### Neu offen aus dem 2026-08-11

19. ✅ **Erledigt (2026-08-12): der Klickweg ist e2e-bewiesen.** `web/e2e/carry-over.spec.ts`
    fährt genau „den einen Durchlauf, der zählt": denselben alten QR zweimal scannen (per
    Handscanner-Kanal, `[data-scan-capture]` + Enter — die alte Blockade „Agent kann sich nicht
    anmelden" fiel mit den gültigen e2e-Creds aus §7.29), beide Male bestätigen, danach zählt der
    Staff-Client: **exakt eine Zeile** im Zielturnier, `checked_in_at` gesetzt. Details im
    §5-Changelog. Der dabei gefundene UI-Rand (zweiter Scan bot die Übernahme erneut an) ist
    noch am selben Tag behoben — §7.38, „Alt-QR wird Vollpass"; die Spec pinnt seither das
    neue Verhalten („Schon anwesend" beim Zweit-Scan).
20. ✅ **Erledigt (2026-08-12), derselbe Spec.** Zwei Turniere + Quelle mit Konto: Ziel über
    `withFixtureTournament`, Quelle über direktes `createFixtureTournament` mit eigenem
    `afterAll`-Delete; `registerAndCheckIn` liefert seit heute auch `qrToken` mit (RETURNING
    unter der Owner-Policy, kein zweiter Roundtrip).
21. ✅ **Erledigt (2026-08-12): der Referee-Pfad ist mit einem ECHTEN Konto durchgespielt.**
    Angelegt: `referee@test.de` / `12345678` (auth-Admin-API + `profiles`-Zeile mit
    `role='referee'` und — Pflicht! — gesetztem `org_id`, sonst scheitert jeder
    `current_org_id()`-Check). Rene hat als dieser Referee live: **Ergebnisse freigegeben**
    (Sammel-Freigabe „Alle 2 freigeben", beide Matches `done` mit korrektem Sieger) und
    **eingecheckt** (drei Team-Spieler). Gegenprobe der Grenze im Browser bestätigt: die
    Bracket-Seite wirft den Referee auf die Übersicht zurück
    (`bracket/page.tsx:84`, nur `admin|organizer`) — er kommt gar nicht erst an
    „Neu generieren". Das Konto bleibt für künftige Turniere bestehen.
22. 🟢 **Übernahme ohne Konto ist nicht möglich** und das ist eine bewusste Grenze, kein Bug (§5.1).
    Wer sie aufheben will, muss zuerst beantworten, was der alte QR danach tun soll — der Token ist
    unique, kopieren geht nicht.
23. ✅ **Entschieden (Rene, 2026-08-12): `allow_carry_over` bleibt dauerhaft AN.** Die
    carry-over-Spec setzt den Haken in `beforeAll` zusätzlich explizit auf `true` (Staff-RLS
    `orgs_write_staff_same_org` erlaubt das direkt) — der Test stirbt also nicht, falls ihn
    jemand ausknipst, und stellt nichts zurück.

### Neu offen aus dem Person/Team-Umbau (2026-08-11)

24. ✅ **`tournaments.team_size` ist ab dem ersten Teilnehmer gesperrt** (`ff71519`, kein neuer
    Migrationscode — reine Anwendungslogik). `updateTournament` zählt `participants` neben den
    bestehenden Matches; gibt es welche, verlässt `team_size` den Patch, und bei einem abweichenden
    Wert wird die Action mit einer deutschen Meldung abgelehnt (`TEAM_SIZE_LOCKED` in
    `lib/tournament/lifecycle.ts`). Formular deaktiviert das Feld und zeigt dieselbe Konstante daneben.
    528 Tests grün, Build grün, live. Details im Protokoll **§16**.
    ⚠️ **Zeitlinie, wichtig fürs Verständnis des Vorfalls:** dieser Riegel ging am 2026-08-11 erst um
    **15:15:53** auf `origin/main` (git reflog geprüft) — die `team_size`-Umstellung im
    Rocket-League-Turnier passierte Stunden **davor** (08:52–09:02). Der Riegel wurde nicht umgangen,
    er war noch nicht da. Frühere Fassungen dieses Punkts lasen sich anders.
    **Seit dem 2026-08-11 abends zusätzlich in der Datenbank verankert:**
    `20260812090000_team_size_guard.sql` — der TypeScript-Riegel deckte PostgREST-Direktzugriffe
    nicht (Details im Abend-Changelog in §5).
25. ✅ **Komplett erledigt (2026-08-12).** Die August-Runde deckte schon Nachmeldung,
    Tresen-Zuordnung, Generieren-Warnung, Seeding und Übersichts-Warnung ab; in der
    Gerätetest-Runde kamen die letzten zwei dazu: **Sammel-Freigabe** von Rene als Referee
    geklickt (grüne Karte „2 Partien einig" → „Alle 2 freigeben" → beide `done`), und das
    **Ziehen per Pointer-Events trägt auf einem echten Tablet** — Karte lässt sich mit dem
    Finger greifen und ablegen. ⚠️ Wichtig fürs Verständnis (und für künftige Tester): der
    Teams-Screen ist ein **Entwurfs-Modus** — nach dem Ablegen muss **gespeichert** werden,
    sonst springt der Spieler beim Neuladen zurück. Beim ersten Durchgang sah die DB deshalb
    unverändert aus, obwohl das Ziehen funktionierte; kein Bug, aber die Stelle, an der ein
    Test fälschlich „kaputt" melden würde.
26. ✅ **Erledigt (2026-08-12): der Trigger feuert wirklich.** Rene hat drei echte Check-ins
    über die Oberfläche gemacht (Alpha Anna/Ben/Cem); die Team-Zeile bekam
    `checked_in_at = 18:35:36.660299` — **mikrosekundengleich mit dem dritten Spieler**, also
    in derselben Transaktion mitgestempelt, nicht durch einen Nachlauf. `sync_team_ready`
    (`20260811092000:259-324`) ist damit produktiv belegt, der „Spielbereit"-Notknopf bleibt
    als Reserve.
27. ✅ **Erledigt (2026-08-12): `team_members` ist gedroppt** (Freigabe Rene, Migration
    `20260812190000_drop_team_members.sql`, per db2 angewandt, DB-Version `20260812160240`).
    Vorher nachgemessen: die Tabelle war **bereits leer** — die Alt-Zeilen sind über den
    `participant_id`-FK-Cascade mit den gelöschten Alt-Teams verschwunden, der „Rückweg"
    existierte also faktisch nicht mehr. Kein Code, keine Funktion, kein Trigger, kein
    eingehender FK referenzierte sie. `database.types.ts`: nur der `team_members`-Block
    chirurgisch entfernt — **kein** Generator-Vollersatz, der hätte die handgepflegten
    Nullability-Fixes an RPC-Returns überschrieben (bekannte Generator-Schwäche, §7.32).
    Danach 580 Unit-Tests + Build grün.
28. ✅ **Erledigt (2026-08-12): Geburtsdatum ist jetzt AUCH in der Datenbank gesperrt**
    (Migration `20260812200000_birthdate_referee_lockdown.sql`, angewandt + bewiesen).
    Mechanik: Tabellen-SELECT für `authenticated` widerrufen + explizite Spaltenliste ohne
    `birthdate` zurückgeben (das `anon`-Muster aus `20260621093000`); einziger Leseweg zurück
    ist die DEFINER-Funktion `get_participant_birthdate(uuid)` — NULL für alle außer
    Organizern der eigenen Org. Die Detailseite (`participants/[pid]/page.tsx`) holt das
    Datum jetzt per RPC. Drei Lehrstücke, alle beim Bauen/Beweisen gefunden:
    (a) ein bloßes `revoke select (birthdate)` wäre ein **stiller No-op** gewesen — Spalten-
    REVOKE nimmt nur Spalten-GRANTs, das Tabellenrecht deckte weiter alles (Builder-Fang);
    (b) eine `security_invoker`-View scheidet aus — sie dürfte die Spalte nach dem Revoke
    selbst nicht lesen (Invoker-Paradox); (c) ⚠️ **Supabase-Default-Privileges granten
    EXECUTE bei CREATE FUNCTION direkt an anon** — das `revoke from public` traf den Grant
    nicht (`proacl` zeigte `anon=X`), erst ein explizites `revoke from anon` schloss die Tür.
    Beweise in zurückgerollten Transaktionen: Referee Direkt-Select → 42501, erlaubte
    Spalten ok, RPC → NULL; Admin RPC → Datum, Direkt-Select → ebenfalls 42501 (EIN
    Leseweg für alle); anon RPC → 42501, Board-Select unverändert; unbekannte Id → NULL.
    Gewollte Nebenwirkung: neue participants-Spalten sind für `authenticated` erst nach
    explizitem Grant lesbar.
29. ✅ **Erledigt (2026-08-12).** Gültiges Konto `test@test.de` / `12345678` (Rolle admin,
    verifiziert), damit lief die komplette Suite inkl. `register-team.spec.ts` grün. Rene hat
    `E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD` in `web/.env.local` selbst nachgezogen (für Agents
    gesperrt, Permission-Deny) — `login.spec.ts` läuft jetzt ohne Env-Präfix grün, die Datei
    greift also wieder. Historie: erst liefen die Creds als Shell-Env (`.env.local` trug noch
    die alten Werte), Rene hat die Datei danach aktualisiert.
30. 🟢 **„Partie starten" kann nur starten, nicht zählen oder beenden.** `start_match_as_player`
    (`20260811130000`) setzt `status='live'`. Zählen bleibt beim Scorekeeper (ein zweiter paralleler
    Zähler würde ihn überschreiben), Beenden auch (daraus baut `scorePrefill` den Freigabe-Vorschlag,
    und die Einigkeit der Spieler hat ohnehin Vorrang). Bewusst so, kein fehlendes Feature.
31. 🟢 **Das Realtime-Abo auf `match_reports` läuft ungefiltert**, weil die Tabelle keine
    `tournament_id` hat. Ein Organizer mit Parallelturnieren bekommt überflüssige Refreshes. Harmlos
    (RLS bleibt), sauber wäre eine denormalisierte `tournament_id`.
32. ✅ **Behoben (2026-08-12): Token-Modus + Team + alle Partien gespielt = leere Partienliste.**
    `get_participant_by_qr_token` liefert jetzt `team_id` mit (Migration
    `20260812100000_participant_token_team_id.sql`, DROP+CREATE weil sich der Rückgabetyp ändert,
    Grants neu ausgesprochen). `/me` rechnet `coalesce(team_id, id)` damit direkt
    (`me/page.tsx`); die Umweg-Ableitung über das offene Match ist raus — der
    `get_open_match_by_qr_token`-Block bleibt nur noch für `tokenReport` (gemeldete Scores sind
    nicht public-lesbar). Dreifach geprüft: DB-Beweise als `anon` in zurückgerollter Transaktion
    (Team-Spieler → `team_id` gesetzt, Solo → NULL, unbekannter Token → leer), unabhängiger
    Prüfer FREIGABE (u. a. bewiesen, dass die entfernte Override-Zeile zeichengleich dieselbe
    `coalesce`-Rechnung machte wie die neue Zeile — verhaltensneutral bei offenem Match, strikt
    besser ohne), Browser-Beweis mit synthetischem `finished`-2v2 (Wegwerf-Daten, danach
    gelöscht): Partienliste zeigt „vs Team Beta · Gespielt · 3:1" statt leer, Warteschlange
    korrekt „keine Partie an". Typen regeneriert und deckungsgleich (der Generator verliert
    Nullability bei RPC-Returns — Datei-Stil `string | null` beibehalten).

### Neu offen aus dem 2026-08-11 (Geburtsdatum-Fix, Nachmittag)

33. ✅ **Erledigt (2026-08-12): beide Deutungen abgeräumt.** (a) Der alte `padOnBlur`-Bug ist
    seit `1dbfbdb` gefixt und mehrfach abgesichert (unit-gepinnt, die e2e-Suite tippt das Feld
    täglich durch); Rene hat am Abend selbst einen Test-Teilnehmer über das Formular angelegt —
    kam sauber an (`2013-02-25`, DB-geprüft). Der Vorfall war demnach ein Nachzügler vor dem
    Deploy. (b) Der zweite Rand ist jetzt AUCH zu: eine **einzelne** getippte `0` bleibt beim
    Verlassen des Feldes als `0` stehen statt zu `00` aufgefüllt zu werden (`padOnBlur` in
    `birthdate-field.tsx` überspringt die bloße `0` — sie ist der Anfang von 01–09, kein Tag).
    Unit-Test dazu in `birthdate-field.test.tsx` („lässt eine einzelne '0' beim Verlassen
    unvollständig stehen"). 581 Tests grün, Build grün.

### Neu offen aus dem 2026-08-11 (Rene, Nachmittag)

34. ✅ **Geklärt und behoben — „Solo-Anmeldung als Team, danach nur 3 Spieler".**
    Die vier Workstreams (A Nachmeldung-Einzelweg, B Tresen-Zuordnung, D Generieren-Warnung,
    C Kinder-Flow) sind mit dem Nacht-Commit vom 2026-08-11 live — Details im §5-Changelog
    „Die vier Feature-Workstreams". Ursprünglicher Befund bleibt unten als Historie stehen:
    Die 13-Agenten-Forensik (2026-08-11 abends) hat die Vermutungsrichtungen **widerlegt**: der
    Team-Schritt der Kinder-Anmeldung ist bei `team_size = 1` korrekt gesperrt (UI **und**
    `assert_team_phase`) und war nie erreichbar. Wirkliche Kette: das Turnier war ein **3v3**, das
    Phantom-Team („Team-Niki", 1 von 3) kam vom **Nachmelde-Formular am Tresen**, das bei
    `team_size > 1` keinen Einzelweg anbietet (`created_at`-Reihenfolge + `user_id IS NULL` beweisen
    den Pfad); zwischen 08:52 und 09:02 wurde dann `team_size` auf 1 gestellt (vor dem Riegel, §7.24),
    was die 10 `player`-Zeilen verwaiste. Die „3" war die Wettkämpfer-Zählung der Turnier-Übersicht
    (Team-Niki + 2 nach der Umstellung angemeldete `solo`). Härtung ist drin (§5, Abend-Changelog);
    die Feature-Fixe laufen: Einzelspieler-Nachmeldung, Tresen-Zuordnung, Generieren-Warnung,
    Kinder-Flow (Plan „Team-Turnier-Fixes", von Rene abgenommen). Punkt schließen, sobald die vier
    Workstreams live sind.
35. ✅ **Bracket-Neu-Mischen erreichbar** (2026-08-11 abends). Die Prämisse war halb falsch: ein
    Fisher-Yates-Shuffle existierte längst („Zufällig setzen", `seeding-client.tsx`), er war nur
    unerreichbar, sobald Matches existierten (`!hasMatches`-Ternär). Jetzt rendert der Seeding-Block
    in beiden Zweigen (`bracket/seeding-section.tsx`), direkt über „Bracket neu generieren":
    Zufällig setzen → speichern → Neu generieren. Die Generatoren bleiben bewusst deterministisch
    (kein `Math.random()` in `generateBracket` — reproduzierbare Generierung, Vorschau bleibt,
    handgesetztes Seeding wird nicht stillschweigend überschrieben). Randnotiz aus der Forensik: im
    konkreten Vorfall hätte Mischen nichts geändert (N=2 hat nur eine Paarung); der gemeldete Fall
    „zwei gleichstarke Teams in Runde 1" stammt aus einer größeren Auslosung.

### Neu offen aus dem 2026-08-12 (e2e-Reparatur)

36. ✅ **Behoben (2026-08-12): Hydration-Mismatch in `PushOptIn`.** Wurzel war Zeile 14:
    `if (!pushSupported()) return null` — `pushSupported()` liest `window`, der Server rendert
    also `null`, der Client das Panel, React verwirft den Server-Baum. Fix:
    `useSyncExternalStore(emptySubscribe, pushSupported, () => false)` — Server-Snapshot
    `false` heißt: SSR und erster Client-Render sind beide `null`, danach entscheidet der
    echte Browser-Support. ⚠️ Das naheliegende mounted-Gate (`useEffect` + `setState`)
    verbietet die Repo-Lint-Regel `react-hooks/set-state-in-effect` — wer hier nachbessert,
    bleibt bei `useSyncExternalStore`. Bewiesen: kompletter Suite-Lauf, null
    Hydration-Meldungen im Dev-Server-Log (vorher bei jedem /me-Aufruf).
37. ✅ **Behoben (2026-08-12): `generateBracket` schreibt das Bracket in EINEM INSERT.**
    Die ~20 sequenziellen Einzel-UPDATEs (Winner-/Loser-Links, Freilos-Weiterleitung)
    existierten nur, weil die Match-Ids erst die DB vergab. Jetzt: `crypto.randomUUID()` pro
    Zeile vorab, `buildIdMap` läuft gegen die eigenen Rows (Signatur passte unverändert),
    die drei `resolve*`-Ergebnisse werden in-memory auf die Rows geschrieben, dann ein
    einziger `.insert(rows)` ohne `.select()`. ⚠️ **Postgres prüft Self-FKs
    (`next_match_id → matches.id`) am Statement-Ende** — Intra-Batch-Referenzen in einem
    Multi-Row-INSERT sind sauber; steht auch als Kommentar im Code, damit niemand den
    Zwei-Phasen-Tanz „vorsichtshalber" zurückbaut. Neu gepinnt in
    `actions.generateBracket.links.test.ts`: Double-Elim-Payload enthält alle 5 Winner- und
    3 Loser-Links intra-batch, und es gibt keinen `update()` auf matches im Generate-Pfad.
    Der 20s-Timeout in `double-elim.spec.ts` bleibt als Sicherheitsmarge (Kommentar
    aktualisiert).
38. ✅ **Behoben (2026-08-12, noch am selben Tag): „Alt-QR wird Vollpass".** Ursprünglicher Fund
    beim §7.19-Beweis: zweiter Scan eines schon übernommenen QR bot die Übernahme ERNEUT an
    (alter QR zeigt auf die alte Zeile, `qr_token` wird nie kopiert, `row.created` wurde nie
    gelesen). Fix nach Rene-Entscheidung **beim Scan, nicht beim Bestätigen**: der
    Fremd-Turnier-Zweig in `handleToken` (`scanner-client.tsx`) fragt bei `user_id`-Tokens
    zusätzlich nach, ob die Person schon im ZIEL-Turnier steht — Treffer ersetzt `participant`
    durch die Ziel-Zeile und fällt in den normalen Same-Tournament-Pfad durch: eingecheckt →
    bestehende „Schon anwesend"-Karte; nicht eingecheckt (Reparaturfall: Übernahme lief,
    Check-in scheiterte damals) → regulärer `check_in` + Erfolgs-Karte. **Kein neuer
    Kartentyp, keine Duplikation** — der alte QR verhält sich exakt wie der neue.
    Zweitabfrage kostet nur im seltenen Fremd-Token-Fall; Fehler dort = fail-open Richtung
    Angebot (Übernahme bleibt idempotent). e2e angepasst und grün (`carry-over.spec.ts`,
    Zweit-Scan erwartet „Schon anwesend", Zeilen-Zählung bleibt der Beweis).

## 8. Datei-Landkarte
- `web/src/app/` — Routen. Öffentlich: `page.tsx`, `o/[slug]/`, `t/[tournamentId]/{,register,me,board,checkin-station}`. Auth: `(auth)/login`, `(auth)/signup`, `auth/confirm/route.ts`, `link/[token]/route.ts` (Geräte-Kopplung). Organizer: `organizer/`, `games`, `members` (Org-Name + Geräte + Mitglieder), `tournaments/[id]/{,bracket,matches,participants,checkin,station}`. Scorekeeper: `score/[token]/`.
- `web/src/lib/` — `bracket/`, `swiss/`, `groups/`, `standings.ts`, `tournament/lifecycle.ts`, `org/`, `auth/{staff,org-tournament,device-pairing,device-label}.ts`, `supabase/{server,client,public,admin}.ts`, `format-date.ts`, `hardware-scan.ts`, `scan-feedback.ts`, `push/`, `station/`, `db-errors.ts`, `database.types.ts`.
- Check-in-Scanner (`web/src/app/organizer/tournaments/[id]/checkin/`): `scanner-client.tsx` (Modus-Schalter, Kamera, Check-in-RPC), `scan-result-card.tsx` (Ergebnis-Karte + `resultContent`), `use-hardware-scan.ts` (beide Handscanner-Kanäle + die zwei Diagnose-Logs), `scan-diagnostics.tsx` (Panel), `use-cameras.ts` (Linsen-Liste), `attendance-row.tsx` (Einchecken/Zurücksetzen). Pure Logik: `web/src/lib/hardware-scan.ts`.
- **Passwort-Flow (neu 2026-08-10):** `web/src/app/(auth)/passwort/` (`actions.ts` + `actions.test.ts`, `page.tsx` = Modus-Weiche, `password-form.tsx`, `vergessen/`), `web/src/lib/auth/recovery.ts` (Cookie-Name + `hasRecoveryCookie`), `web/src/lib/origin.ts` (aus `login/actions.ts` herausgelöst — dort wäre jeder Export eine aufrufbare Server-Action gewesen). Routing sitzt in `auth/confirm/route.ts`.
- **Zugang-sichern (neu 2026-08-10):** `web/src/components/ui/alert-dialog.tsx` (Base-UI-Wrapper), `web/src/app/t/[tournamentId]/register/save-access-dialog.tsx` (+ Test), `web/src/components/qr-actions.tsx` (`variant="bare"` + exportiertes `participantRecoveryUrl`, damit angezeigte und kopierte URL nicht auseinanderlaufen).
- `supabase/migrations/` — alle live angewandt. Neu: `20260807170000_tournament_archive.sql`, `20260807200000_device_pairing.sql`, `20260808060000_checkin_scan_channel.sql`, `20260810090000_photo_consent_optional.sql`, `20260810120000_participants_insert_staff.sql`, `20260810140000_participant_link_writes.sql`.
- **Geburtsdatum-Feld (neu 2026-08-10):** `web/src/components/birthdate-field.tsx` (+ Test) — drei Zahlenfelder statt Kalender, gibt `YYYY-MM-DD` heraus. Benutzt von `t/[tournamentId]/register/register-client.tsx` (über RHF-`Controller`) und `organizer/tournaments/[id]/participants/add-participant-form.tsx` (kontrolliert). Reine Logik exportiert: `partsToIso`, `partsFromText`.
- **Anschriftsfeld (neu 2026-08-11):** `web/src/components/address-field.tsx` (+ Test) — Straße/PLZ/Ort, gibt **eine** Zeile heraus; reine Logik `partsToAddress`, `partsFromAddress`. Dazu die Route `web/src/app/api/plz/route.ts` (Proxy auf openplzapi, nur die PLZ verlässt das Haus). Benutzt in `t/[tournamentId]/register/consent-step.tsx`.
- **Übernahme am Einlass (neu 2026-08-11):** `supabase/migrations/20260811140000_org_carry_over_switch.sql` + `…141000_carry_over_participant.sql` (Begründung der Ausnahme steht im Kopf der zweiten und in §5.1); Oberfläche in `organizer/tournaments/[id]/checkin/scanner-client.tsx` (`carryOverAllowed`, `confirmCarryOver`, `pendingRef`) und `…/scan-result-card.tsx` (Zustände `carryOverOffer` / `carriedOver` / `carryOverFailed`, `awaitsDecision`, `actions`-Prop); Schalter in `organizer/members/{actions.ts,org-settings.tsx,page.tsx}` (`setOrgCarryOver`).
- **Fotoerlaubnis (neu 2026-08-10):** `web/src/lib/consent-text.ts` (+ Test) — Wortlaut, Legacy-Fallback; `web/src/app/t/[tournamentId]/register/consent-step.tsx` (`PhotoConsentStep`, optional); `web/src/components/brand/photo-consent-chip.tsx`; Ausdruck unter `web/src/app/organizer/tournaments/[id]/consents/` (`page.tsx` + `print-button.tsx`).
- `docs/superpowers/{specs,plans}/` — Designs + Pläne. `docs/DEPLOY.md` — Deploy/Setup-Notizen.
- Brain (Obsidian, NICHT im Repo): `C:\Users\Rene\Documents\Zweites-Gehirn\02 Projekte\Turnier-App\`.

## 9. Erste Schritte für dich
1. `git -C C:\Users\Rene\Turnierapp log --oneline -10`, `git status`.
2. db2-Verbindung testen: `mcp__supabase-db2__list_tables` (~15 Tabellen erwartet). Bei „Unauthorized" → User muss `SUPABASE_ACCESS_TOKEN_DB2` setzen + Claude Code neu starten.
3. `cd web && npm run build && npm test` (**405** grün erwartet). ⚠️ `npm run lint` meldet 6 Altlasten in
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

---

## 11. Protokoll — Session 2026-08-10 (Auth & Teilnehmer-Zugang)

Chronologisch, damit nachvollziehbar bleibt **wie** entschieden wurde, nicht nur was.

### Ausgangsfrage des Users
Drei Fragen auf einmal: (1) Kann man sich nach einem Magic-Link auch mit Passwort anmelden, und unter
welcher Adresse? (2) Kinder klicken am Fertig-Screen vorbei und verlieren ihren Zugang — sollte man
das mit einem Dialog bestätigen lassen? (3) Eltern melden auf ihrem Handy an, das Kind steht aber
allein am Turnier — kommt es an seinen Status?

**Erste Erkenntnis: zwei der drei Sachen gab es schon.** `/login` hatte längst beide Formulare, und
der Recovery-Link `?token=` funktionierte cross-device. Nur eben read-only, und ohne Passwort-Reset.
Das hat den Zuschnitt der Arbeit bestimmt: nicht drei Features bauen, sondern **eine echte Lücke
schließen (A), eine Warnung verbindlich machen (B), eine Grenze verschieben (C)**.

### Ablauf
| Phase | Was passierte |
|---|---|
| Bestandsaufnahme | Code gelesen statt geraten — ergab, dass B und C bereits zur Hälfte existierten |
| Plan (A + B) | Plan-Modus, zwei Explore-Agents parallel (Auth-Fläche, UI-Inventar), dann ein Plan-Agent |
| Rückfragen | Vier Entscheidungen dem User vorgelegt: Dialog-Ort, Dialog-Strenge, Mailversand, Cross-Device-Template |
| Bau A + B | Commits `6e3e21c`, `3a324b5` — B bewusst **nicht** eingehängt, weil `register-client.tsx` fremde Arbeit trug |
| Dashboard | SMTP/Template/Rate-Limit, teils vom User (API-Key), teils von mir |
| Bau C | Umfang per Rückfrage geklärt, Migration `20260810140000`, Commit `015b759` |
| Doku | §5/§7/§10 dieser Datei, Memory, danach dieses Protokoll |

### Was gut war
- **Erst lesen, dann planen.** Die Antwort „das gibt es schon, nur read-only" war mehr wert als jedes
  Feature, das ich sonst doppelt gebaut hätte.
- **Rückfragen an den Entscheidungspunkten**, nicht vorher und nicht hinterher. Der Umfang von C
  (Check-in **und** Melden) war eine Risikoentscheidung des Users, keine Implementierungsfrage.
- **Beweise statt Behauptungen.** Rollback-Transaktion für die Schreibpfade, Resend-Log für die Mail,
  fremder Browser für Cross-Device. Jede dieser drei Prüfungen hat etwas gefunden oder widerlegt.
- **Fremde Arbeit nicht mitgerissen.** Der Arbeitsbaum enthielt eine unfertige Fotoerlaubnis mit nicht
  angewandter Migration. Statt „alles committen" nur die eigenen Dateien — und die Import-Auflösung
  gegen den Index geprüft, um sicher zu sein, dass der Teilstand für sich baut.

### Was schlecht war
- **Drei Annahmen ungeprüft in Pläne geschrieben** (Leak-Schutz „ein Klick", `pkce_` nicht
  cross-device, `git add` als Müll-Ursache). Alle drei fielen beim ersten Hinsehen. Zwei standen
  schon als Empfehlung im Dokument, bevor sie geprüft waren — **das ist die teuerste Angewohnheit
  dieser Session.**
- **Zu spät gesagt, was ich nicht darf.** Dass Konto-Logins und API-Keys für mich gesperrt sind, kam
  erst heraus, als der User „mach die drei Schritte" sagte. Das gehört in den Plan, nicht ans Ende.
- **Screenshot statt `read_page`** beim Prüfen des Anmeldezustands — kostete eine Runde auf falscher
  Fährte.
- **Selbst Müll-Dateien produziert** und die Ursache dann falsch dokumentiert.

### Was offen blieb (Details in §7)
Leak-Schutz braucht Pro · Magic-Link-Template weiter PKCE · abgelaufenes Recovery-Fenster meldet sich
irreführend (#13) · `consent-step.tsx` doppelter Accessible-Name (#14, seit 2026-08-10 erledigt) ·
die drei Auth-Schalter, die
niemand umlegen darf (#12).

---

## 12. Protokoll — Session 2026-08-11 (Geburtsdatum, Anschrift, Übernahme am Einlass)

⚠️ **Diese Sitzung lief die ganze Zeit parallel zu einer zweiten** im selben Arbeitsbaum („3on3
Eff-State Team Management"). Die hat an einem Tag elf Migrationen angewandt und das Teilnehmer-Modell
umgebaut. Wer die Historie liest, findet die Commits verzahnt — und wichtiger: **der Boden bewegte
sich während der Arbeit.** Zwei Migrationen kamen mitten in meiner Planung dazu.

### Was gebaut wurde

| Was | Commit |
|---|---|
| Geburtsdatum-Prüfung entdoppelt + CHECK auf `participants.birthdate` | `c7d2f28` |
| Doppelter Accessible-Name in der Fotoerlaubnis + erster Test für den Schritt | `ad71491` |
| Geburtsdatum wird getippt (TT · MM · JJJJ), beide Formulare | `07a37b4` |
| Anschrift dreigeteilt, Ort aus der PLZ über eigene Route | `ca1f6fe` |
| Scanner checkt nicht mehr ins falsche Turnier ein | `584be78` |
| Übernahme am Einlass (DB + Oberfläche) | `3e5e392`, `f7cbf95` |

### Wie vorgegangen

Bestand messen statt annehmen — und zwar **gegen die Live-DB**, nicht gegen den Code. Für die
Übernahme: Frage-für-Frage-Interview mit dem User über den Entscheidungsbaum (Grundmodell → Konto-Id
→ Schalter → Teamturnier → Fotoerlaubnis → Bedienung), erst danach ein Plan, und der Plan gegen den
Stand der Parallelsitzung gegengeprüft, bevor er abgeschickt wurde.

### Was gut war

- **Jeder Beweis hat etwas gefunden oder widerlegt.** Der Scanner-Riegel entstand nur, weil ich beim
  Nachsehen für die Übernahme über `void tournamentId` gestolpert bin. Die `RETURN QUERY`-Falle fiel
  beim zurückgerollten Idempotenz-Test auf, nicht beim Lesen. Die Doppelbenennung im Geburtsdatum-Feld
  meldeten die vorhandenen Formulartests.
- **Gegenprobe bei jedem Regressionstest.** Aria-Fix und Countdown-Pause wurden je einmal
  zurückgebaut, um zu sehen, dass der Test wirklich rot wird. Ein Test, der nie rot war, beweist nichts.
- **Fremde Arbeit nicht mitgerissen.** Bei 22 geänderten Dateien der anderen Sitzung wurde jeder
  Commit mit expliziten Pfaden gebaut und der Diff der eigenen Dateien vorher angesehen.

### Was schlecht war

- ⚠️ **Zwei Behauptungen standen im Plan, bevor sie geprüft waren, und beide fielen um.**
  (1) „`organizations` trägt Spalten-Grants" — falsch, es sind Tabellen-Grants; meine zwei `grant`-Zeilen
  waren wirkungslos, und der Migrationskopf behauptete zunächst das Gegenteil. Erst nach dem Anwenden
  gemessen. (2) `#15` in der Doku beschrieb einen Bug, den es nie gab. **Ein Explore-Agent hatte die
  erste Behauptung bestätigt** — zwei übereinstimmende Quellen sind kein Beweis, wenn beide raten.
- **Ein echter Fehler ging raus und wurde von der anderen Sitzung gefunden** (`1dbfbdb`): `padOnBlur`
  las aus dem State statt aus dem Ereignis, dadurch wurde aus einer getippten `05` eine `00` — für
  jeden Tag und Monat unter dem zehnten. Meine zehn Tests deckten den Fall nicht ab, weil sie den
  Fokussprung und das `blur` nie im selben Ereignis auslösten.
- **Migrations-Zeitstempel kollidiert** (`20260811120000` doppelt vergeben). Ich hatte den nächsten
  freien Stempel aus der **DB** abgeleitet; die Parallelsitzung vergibt sie nach **Dateinamen**, und
  beide Reihen laufen auseinander. Umbenannt auf `140000`/`141000`.
- **Eine `localhost`-Orga-Session abgemeldet**, um an den Fotoerlaubnis-Schritt zu kommen. Vorher
  gefragt, aber es war fremder Zustand.

### Was der Nächste zuerst tun sollte

1. **§7.19** — die Übernahme einmal wirklich durchklicken, besonders der doppelte Scan.
2. **§5.1 lesen, bevor irgendjemand `participants_insert_staff` anfasst.** Dort steht, warum es jetzt
   genau eine Ausnahme gibt und woran sie hängt (am Token, nicht an einer Id).
3. Bei Migrationen: **Dateinamen UND `list_migrations` vergleichen**, die beiden Reihen stimmen nicht
   überein.

---

## 13. Protokoll — Session 2026-08-11 (Hintergrund aufgehellt)

Kurze Sitzung, eine Frage, ein Commit (`5e11b9f`). Details der Werte in §5.

### Ausgangsfrage des Users

> „können wir die Background Farbe von der Webseite heller stellen, geht das ohne das laufende
> Turnier kaputt zu machen?"

Die zweite Hälfte ist die eigentliche Frage. Antwort: ja — Design-Tokens sind CSS, sie berühren weder
DB noch Auth noch Turnier-Logik. Ein laufendes Turnier kann daran nicht scheitern.

### Wie vorgegangen

1. `globals.css` gelesen, **bevor** irgendwas geändert wurde — dort hängt die ganze Palette an einem
   `@theme inline`-Block plus einem `.dark`-Block, die teils dieselben Werte doppelt führen
   (`--color-bg` und `--background` sind zwei Variablen mit demselben Hex).
2. Alle Flächen um denselben Betrag angehoben statt nur den Hintergrund (Begründung in §5).
3. Nach rohen Hex-Werten im ganzen `web/` gegreppt — das förderte die zwei Streifen-Gradienten und
   ein übersehenes `--sidebar-primary-foreground` zutage.
4. Am laufenden Dev-Server gegengelesen, nach dem Push noch einmal gegen die Live-Domain.

### Was gut war

- **Der Grep nach Hex-Werten.** Ohne ihn wären zwei Seiten mit dem alten Streifenmuster stehen
  geblieben — sichtbar erst auf der Turnierseite, also genau dort, wo es auffällt.
- **Nicht nur `--background` angefasst.** Der Einzeiler wäre der kürzere Diff gewesen und hätte die
  Flächen-Hierarchie zerstört.
- **Gegen die Live-Domain gemessen**, nicht gegen `localhost` — der Deploy ist das, was Rene sieht.

### Was schlecht war

- **Der Dev-Server dieser Sitzung startete dreimal nicht**, weil aus einer anderen Sitzung bereits
  einer auf Port 3000 lief (`Another next dev server is already running`) — Next erlaubt nur einen
  pro Verzeichnis. Erst nach dem dritten Fehlschlag im Log nachgesehen. **Läuft der Preview nicht an:
  sofort die Server-Ausgabe lesen, nicht neu starten.** Verifiziert wurde am fremden Server auf 3000.
- **`vercel list_deployments` gab 403** (Token hat keinen Zugriff auf den Scope
  `moellersrene-3676s-projects`). Der Deploy ließ sich nur indirekt über die Live-Domain bestätigen.

### Nebenbei aufgeräumt

Die 0-Byte-Datei `web/{,` aus dem 2026-08-10er Shell-Unfall (§4) gelöscht — leer, untracked, kein
Inhalt verloren. Die zehn Geschwister waren schon weg.

---

## 14. Protokoll — Session 2026-08-11 (Person/Team-Umbau, sieben Phasen)

Parallel zu §12/§13 gelaufen, im selben Verzeichnis. Beide Sitzungen haben `database.types.ts`
angefasst — additiv, ohne Konflikt. Die Zeitstempel-Kollision (`20260811120000` doppelt) hat die
andere Sitzung selbst nach `140000`/`141000` aufgelöst.

### Ausgangsfrage des Users

„Ich habe ein 3on3. Wenn man sich anmeldet, fragt er, ob man ein Team gründen möchte … wie ist das,
wenn man kein Team gründet? Kann man später Teams zusammenschließen?" Dazu zwei Wünsche für „Mein
Status": QR einklappen, nächste Partien sehen — und Ergebnisse selbst melden, die der Schiedsrichter
bestätigt.

Antwort nach dem Blick in den Code: **beides ging nicht.** Kein „ohne Team", kein späteres
Zusammenschließen — die `participants`-Zeile *war* das Team. Und die Melde→Freigabe-Kette existierte
zu 80 %, sie war nur unsichtbar (kein Realtime, keine Sammel-Freigabe).

### Ablauf

Sieben Phasen, in dieser Reihenfolge: Roster sichtbar machen (Sofortfix) → Datenmodell → Anmeldung →
Orga-Teamscreen → Wettkämpfer-Filter → „Mein Status" → Freigabe-Flow → Schiri-Rolle. Danach zwei
Nacharbeiten (Spieler-Start, e2e-Umbau) und ein Datenaufräumen.

Vorgehen bei allem Datenbanknahen, und es hat sich jedes Mal ausgezahlt: **Snapshot → Rollback-Probe
mit Bestandszählung → anwenden → gegen `pg_policies`/`pg_proc`/`pg_constraint` verifizieren.**

### Was gut war

- **Adversariale Prüfung vor dem Anwenden.** Fünf Perspektiven (Postgres-Semantik, Angreifer mit
  Anon-Key, Datenumzug, Regressionen, der nächste UI-Entwickler), jeder Befund danach von einem
  zweiten Durchgang mit dem Auftrag, ihn zu **widerlegen**. 42 Befunde überlebten, sieben kritisch,
  alle fünf Urteile lauteten „nicht anwendbar wie sie ist". **Zwei davon waren echte Fehler in meinem
  Entwurf** (No-op-Trigger, falsches Wettkämpfer-Kriterium) — beide vor Produktion korrigiert.
- **Gegenlesen mit Reparaturauftrag statt Meldeauftrag.** Jede Bau-Phase bekam einen zweiten Agenten,
  der Fehler direkt behebt. Ausbeute: `MatchReportCard` ohne `key` (hätte das Ergebnis von Runde 1 als
  Meldung für Runde 2 eingetragen), `disbandTeam` mit totem `23503`-Zweig (die Match-FKs sind
  `ON DELETE SET NULL` — „Auflösen" hätte einer gespielten Partie den Sieger genullt), zugeordnete
  Restteams wurden nie spielbereit.
- **Gestaffelt angewandt statt alles auf einmal.** Vier Migrationen sofort (unsichtbar für den alten
  Code), zwei zurückgehalten bis zum Deploy — der Schutz-Trigger hätte die 3on3-Anmeldung auf der
  Live-Seite sofort gebrochen, weil der alte Client `type='team'` schreibt.
- **Am Ende auf Produktion durchgespielt**, zwei echte Gast-Sitzungen, statt sich auf 515 grüne Tests
  zu verlassen.

### Was schlecht war

- **Die Rollback-Probe hat den Trigger ohne seine `WHEN`-Klausel angelegt** — also genau den Teil
  nicht geprüft, der beim Anwenden mit 42703 brach. Kostete einen Fehlversuch. **Immer wortgleich
  proben, was angewandt wird.**
- **Zwei eigene Denkfehler**, beide erst durch fremde Prüfung gefunden: der `security definer`-Guard,
  dessen Hintertür immer offenstand, und „Wettkämpfer = `team_id is null`". Der zweite hätte genau die
  Kinderklarnamen freigegeben, die der Umbau schützen sollte.
- **Der Browser-Durchlauf scheiterte zunächst an der Werkzeugkette**, nicht an der App: das getippte
  Geburtsdatumsfeld nimmt per Werkzeug gesetzte Werte nicht an. **Offener Verdacht:
  Browser-Autofill scheitert dort genauso** — nicht nachgewiesen, aber plausibel und einen Blick wert.
  Mit Playwright lief derselbe Weg auf Anhieb.
- **Ein Agenten-Durchlauf starb am Sitzungslimit**, drei Bau-Agenten gleichzeitig auf hoher Stufe.
  Wiederholung lief durch. Bei großen Fan-outs die Last im Blick behalten.
- **Die e2e-Specs waren doppelt kaputt**, und der ältere Bruch hatte nichts mit diesem Umbau zu tun:
  `getByLabel("Geburtsdatum").fill("2000-01-01")` traf seit dem getippten Datumsfeld nur das Tag-Feld
  mit `maxLength={2}`. Aufgefallen ist es niemandem, **weil die Suite Zugangsdaten braucht und nicht
  von allein läuft** (§7, Punkt 29).

### Nebenbei aufgeräumt

- Testteam „Rene_Test" samt vier migrierter Spieler auf Wunsch gelöscht (Sicherung im Scratchpad,
  Turnier danach leer). Die Unterschriftsdatei im Storage-Bucket bleibt — Fremdschlüssel räumen keine
  Dateien ab.
- **Rund fünfzehn 0-Byte-Dateien** im Wurzelverzeichnis entfernt (`p.type`, `{,+`, `m.id`, `HTTP` …),
  Umleitungs-Unfälle aus Shell-Aufrufen mit unmaskierten `>` und `)`. Sie entstehen weiterhin —
  **gezielt adden statt `git add -A`.**
- `report_match` hat durch das explizite `revoke` sein `PUBLIC EXECUTE` verloren; alle neun neuen
  Team-RPCs tragen `public_execute = 0`. Damit sind sie strenger abgesichert als jede ältere Funktion
  dieses Projekts — ein offener Linter-Befund weniger.

### Was der Nächste zuerst tun sollte

1. **§7 Punkt 24** — `team_size` sperren. Läuft schon als eigene Session, Ergebnis prüfen.
2. **§7 Punkte 25/26** — Teams-Screen und automatische Spielbereitschaft einmal mit echten Menschen
   durchklicken. Das sind die letzten ungeprüften Wege im Turnierbetrieb.
3. **§7 Punkt 29** — e2e-Zugangsdaten erneuern. Danach deckt `register-team.spec.ts` den Team-Beitritt
   dauerhaft ab, statt dass jemand ihn von Hand nachstellt.

---

## 15. Protokoll — Session 2026-08-11 (zwei Kinder auf einem Handy — nur Analyse, kein Code)

Reine Klärungs-Session, kein Commit. Rene fragte, ob sich einstellen lässt, dass über dasselbe Handy
zwei Kinder angemeldet werden können.

### Ausgangsfrage des Users

„kann man das einstellen noch das man über das selbe handy 2 Kinder anmelden kann"

### Befund

**Geht heute nicht, ist keine Einstellung, sondern eine harte DB-Sperre.** Ein Handy = eine anonyme
Gast-Sitzung = ein `user_id`. Darauf liegt `unique (tournament_id, user_id)`
(`20260617090000_registration_consent.sql:26`). Zweite Anmeldung mit derselben Sitzung läuft in den
Unique-Violation-Fang in `register-client.tsx:235` („Du bist für dieses Turnier bereits angemeldet.").
Seit dem Person/Team-Umbau (§14) prüft der Bildschirm `get_my_registration` sogar schon **vor** dem
Formular und springt bei Treffer direkt zu `team`/`done` (`register-client.tsx:150`) — Kind 2 sieht
das Formular für den zweiten Namen gar nicht erst.

Heute umgehbar nur mit zweitem Gerät/Browser-Inkognito oder Nachmeldung durch die Orga
(`addParticipant`, §5, „Neu am 2026-08-10").

**Umbau skizziert, nicht gebaut** (User hat sich noch nicht für einen Weg entschieden):
1. Constraint lockern auf `unique (tournament_id, user_id, display_name)` — verhindert weiter den
   Doppelklick-/Reload-Unfall, aber erlaubt Geschwister mit unterschiedlichem Namen.
2. `get_my_registration` müsste mehrere Zeilen liefern statt einer — der Bildschirm zeigt dann eine
   Liste statt direkt zu springen.
3. Button „Noch ein Kind anmelden" zurück ins Formular.
4. Fehlertext bei 23505 anpassen.

**Offener Haken, noch nicht durchdacht:** Team-Turniere. Zwei Geschwister an einem Konto, aber in
zwei verschiedenen Teams — `get_my_team` und der Team-Schritt gehen bisher von **einer** Zeile pro
User aus. Dort steckt der eigentliche Aufwand, nicht in der Constraint-Änderung.

Zwei Wege vorgeschlagen und Rene zur Entscheidung vorgelegt:
- **A (schlank):** immer erlaubt, kein Schalter.
- **B:** pro Turnier ein Häkchen „Mehrfachanmeldung pro Gerät" unter *Organisation*.

Empfehlung war A. **Rene hat sich noch nicht entschieden** — das ist der erste offene Punkt für den
nächsten Schritt.

### Was gut lief

- **Explore-Agent statt selbst grep-Marathon.** Eine Runde hat Formular, Constraint, RPC und die
  dokumentierte Lücke (`carry_over_participant`-Kommentar zu fehlender stabiler Personen-Kennung,
  §5.1) sauber zusammengetragen — inklusive der Stelle, an der der Code selbst schon zugibt, dass es
  keine stabile Wiedererkennung ohne `user_id` gibt.
- **Vor der Antwort verifiziert statt geraten**, was `get_my_registration` genau zurückgibt (RPC-SQL
  gelesen, nicht nur den Frontend-Aufruf) — sonst wäre der Umbauvorschlag an der falschen Stelle
  angesetzt.

### Was schlecht lief

- **Fünf 0-Byte-Mülldateien im Repo-Root gefunden, die nicht aus dieser Session stammen** (`Bei`,
  `Nach`, `` ` ``, `danach`, `sind`, plus eine mit kaputt kodiertem Emoji-Namen `ÔÜá´©Å`) — derselbe
  Shell-Redirect-Unfall wie in §4/§14 dokumentiert, diesmal vermutlich aus einem parallelen
  Terminal-Fenster desselben Nutzers, alle mit Zeitstempel von heute. Beim Aufräumen brauchte die
  Emoji-Datei `git config core.quotepath false`, um den echten Dateinamen überhaupt lesbar zu machen
  — `rm` mit der von `git status` gezeigten Escape-Schreibweise traf sie nicht. **Wieder derselbe
  Rat wie in §4: mehrzeiligen/Sonderzeichen-Text nie roh in eine Shell-Zeile geben.** Alle entfernt,
  `git status` jetzt sauber.

### Was der Nächste zuerst tun sollte

1. **Rene fragen: Weg A oder B** (oben) — ohne Antwort kein Migrationscode.
2. Bei Entscheidung für B: Schalter-Ort ist vermutlich `/organizer/members` neben `allow_carry_over`
   (§5.1) — gleiches UI-Muster, gleicher Freischalt-Stil.
3. **Team-Fall zuerst klären, bevor die Migration geschrieben wird** — `get_my_team`/Team-Schritt auf
   „mehrere Registrierungen pro User" umzustellen ist der größere Teil der Arbeit, nicht die
   Constraint.

---

## 16. Protokoll — Session 2026-08-11 (team_size sperren, §7.24 abgearbeitet)

Direkter Arbeitsauftrag, kein Brainstorming — Zuschnitt, Fundstellen und Ursache standen schon in
§7.24 dieser Datei, vorbereitet von der vorigen Session als eigenständige Aufgabe.

### Umsetzung
- `updateTournament` zählt jetzt `participants` **parallel** zu den bestehenden `matches`. Gibt es
  welche, verlässt `team_size` den Patch, und weicht der übergebene Wert vom gespeicherten ab, lehnt
  die Action mit einer deutschen Meldung ab. Name, Modus und Start bleiben speicherbar — der Riegel
  hängt am Wert, nicht am Formular.
- Formular deaktiviert das Feld und zeigt denselben Satz daneben — **dieselbe Konstante**
  (`TEAM_SIZE_LOCKED`), damit Oberfläche und Server nie auseinanderlaufen.
- ⚠️ **Die Konstante musste nach `lib/tournament/lifecycle.ts`, nicht in `actions.ts`.** Ein
  `"use server"`-Modul darf ausschließlich async Funktionen exportieren — ein `export const` daneben
  löscht beim Build lautlos **alle** Exporte des Moduls, bis der Client-Import bricht. Der Build brach
  genau daran, nicht am neuen Code.
- ⚠️ **Der Übersichts-Zähler musste ein zweiter werden.** Der vorhandene `pCount`
  (`organizer/tournaments/[id]/page.tsx`) zählt über `COMPETITOR_TYPES` — ein Spieler ohne Team steht
  damit bei 0, das Feld wäre aktiv geblieben, und die Ablehnung wäre erst am Server gekommen, ohne dass
  die Oberfläche sie je angekündigt hätte.
- Sperre greift **ab dem ersten Teilnehmer, nicht erst ab Check-in** — begründet, nicht nur gewählt:
  `type` wird beim INSERT gestanzt (§6) und danach nie mehr korrigiert. Schon die erste Anmeldung legt
  fest, was nichts später zurücknimmt; Check-in wäre dieselbe Grenze, nur schwerer zu erklären.

### Verifiziert
528 Vitest-Tests grün (5 neue Fälle: Ablehnung mit deutscher Meldung, unveränderter Wert speichert
trotzdem durch, ohne Teilnehmer schreibt der Wert weiter, RLS-blindes Turnier, Participants-Count-
Fehler), `npm run build` grün. Commit `ff71519`, gepusht, live über den Auto-Deploy (§3).

### Was teuer war
Der Worktree hatte **kein `node_modules`** — bei einem frischen Worktree normal, hier zum ersten Mal
aufgefallen. Eine Junction auf `web/node_modules` des Haupt-Repos schien der schnelle Weg, brach aber
beim Build: Turbopack lehnt Symlinks ab, die außerhalb des eigenen Projektbaums liegen („Symlink …
points out of the filesystem root"). Half nur ein echtes `npm ci` im Worktree. ⚠️ **Für künftige
Worktrees merken:** die Junction spart Zeit beim Testen, sprengt aber `next build` mit Turbopack.

`main` lief während der Session **zweimal** weiter (Theme-Aufhellung, dann Doku) — zweimal
`git fetch` + `git rebase origin/main` statt Merge, und nach **jedem** Rebase Tests **und** Build
erneut geprüft, nicht nur nach dem ersten.

Beim Aufräumen danach zwei weitere leere Streudateien im Repo-Root (`benutzt`, `und`) — derselbe
Shell-Redirect-Unfall, der in §4/§14/§15 schon mehrfach dokumentiert ist, diesmal aus einer deutschen
PowerShell-Fehlermeldung, die als Dateiname interpretiert wurde. Entfernt.

### Offen
Der alte Worktree-Ordner (`.claude/worktrees/competent-lamarr-ca47aa`) ließ sich aus der laufenden
Sitzung heraus nicht löschen — Windows hält ihn gesperrt, solange die Sitzung ihr eigenes
Arbeitsverzeichnis dorthin zurücksetzt. Aus der Git-Worktree-Registrierung ist er raus
(`git worktree remove`), das Verzeichnis selbst braucht ein `rm -rf` von außerhalb dieser Sitzung; der
zugehörige Branch ist inhaltsgleich mit `main` und gefahrlos löschbar.

---

## 17. Protokoll — Session 2026-08-11 (Geburtsdatum: die getippte 05 wurde zur 00)

### Ausgangsfrage des Users
„wenn die kinder sich anmelden und das Geburstatem eintragen geht nicht 05 sondern nur 5 das ist doof"
— am Ende der Sitzung, ohne den Tag/Monat-Fix schon zu kennen, ein Bericht vom laufenden Turnier: ein
Junge tippte sein Geburtsjahr, das Formular meldete einen Fehler, erst der zweite Versuch ging durch.

### Ablauf
1. `birthdate-field.tsx` gelesen, den Aufrufer in `register-client.tsx` und `validBirthdate()`
   nachvollzogen — Repro-Verdacht: der Fokus-Sprung nach der zweiten Ziffer könnte mit `padOnBlur`
   kollidieren.
2. **Reproduziert, bevor gefixt wurde:** eine Wegwerf-Testdatei, die 05.05.2015 Ziffer für Ziffer mit
   `fireEvent.change` eintippt — schlug fehl, Monat landete bei `00` statt `05`. Zwischenlogging
   zeigte den genauen Mechanismus: nach der ersten `0` steht `parts.month` noch leer, der zweite
   `fireEvent.change` liefert `"05"`, aber `padOnBlur` (ausgelöst vom Fokus-Sprung ins Jahr-Feld) las
   zu diesem Zeitpunkt noch aus der Closure-Variable `parts`, nicht aus dem Feld — Zustand einen
   Renderdurchlauf alt.
3. Fix: `padOnBlur` nimmt den Wert jetzt aus dem `blur`-Ereignis selbst (`e.target.value`) statt aus
   `parts`. Zwei Ziffern → nichts zu tun, eine Ziffer → wie bisher mit führender Null aufgefüllt.
4. Regressionstest in `birthdate-field.test.tsx` ergänzt, der den echten Repro-Ablauf nachstellt (nicht
   nur `fireEvent.blur` ohne vorherigen Fokus, wie die bisherigen Tests es taten — genau das hatte den
   Bug bis jetzt unsichtbar gehalten). Wegwerf-Testdatei danach gelöscht.
5. Committed (`1dbfbdb`) und auf Nachfrage des Users gepusht — Risikoabwägung vorab genannt (reiner
   Frontend-Fix, atomarer Vercel-Deploy, offene Tabs laufen mit altem Code weiter, bereits gespeicherte
   `00`-Daten bleiben unangetastet).
6. **Danach meldete Rene den Vorfall mit dem Jungen.** Timing gegen den Deploy (Push ~10:56) ist nicht
   geklärt — die Frage steht offen (§7.33), Rene hat stattdessen diese Doku-Aufgabe gegeben.

### Was gut war
- **Reproduziert vor dem Fix, mit einer Wegwerf-Datei statt am bestehenden Test herumzuschrauben.**
  Der Bug hing exakt an der Fokus-Reihenfolge — `fireEvent.blur()` ohne vorherigen Fokuswechsel hätte
  ihn nicht gezeigt, und genau das taten alle bisherigen Tests. Ohne den eigenen Repro-Schritt wäre der
  „Fix" eine Vermutung geblieben.
- **Root Cause, nicht Symptom:** die Behebung liegt in der einen Funktion, die alle drei Felder
  (Tag/Monat/Jahr) gemeinsam nutzen, nicht in einem Sonderfall pro Feld.
- Vor dem Push explizit das Blast-Radius-Gespräch geführt (§ oben), statt stillschweigend zu pushen.

### Was schlecht war
- ⚠️ Die naheliegendste Klärung — **wann genau stand der Junge an der Theke, vor oder nach 10:58?**
  — wurde einmal gefragt, aber nicht insistiert, als der User stattdessen zur Doku-Aufgabe wechselte.
  Ohne diese Antwort bleibt unklar, ob der gemeldete Vorfall schon erledigt ist oder auf einen zweiten,
  noch offenen Rand zeigt (einzelne `0` in Tag/Monat wird beim Verlassen weiterhin zu `00`
  aufgefüllt — technisch korrektes Padding, das aber am Turniertag denselben Fehlertext produziert).
  **Nicht raten, beim nächsten Kontakt gezielt fragen.**
- `npx tsc --noEmit` lief einmal über das ganze Projekt und zeigte vorbestehende Fehler in fremden
  Testdateien (`qr-code.test.tsx`, `signup/actions.test.ts`, `groups-view.test.tsx`) — keiner davon in
  den geänderten Dateien, aber unnötig Kontext verbraucht, weil ein gezielter `vitest run` auf die
  betroffene Datei gereicht hätte, um Vertrauen ins Ergebnis zu haben.

### Was der Nächste zuerst tun sollte
Uhrzeit des gemeldeten Vorfalls klären (§7.33). Wenn nach dem Deploy: den zweiten Rand angehen — eine
einzelne getippte `0` in Tag oder Monat sollte das Feld als **unvollständig** behandeln, nicht als
`00` auffüllen. Der User hat diesen Fix am Ende der vorigen Runde vorgeschlagen bekommen, aber noch
nicht beauftragt.
