# Turnier-App — Übergabe an den nächsten Agent

**Stand:** 2026-08-11 · Branch `main` @ `ff71519` · **gepusht und live** unter https://turnier-app-opal.vercel.app (Push auf `main` deployt automatisch, siehe §3)

Session-Protokolle der letzten Arbeit stehen in **§11–§13** (was gemacht, wie entschieden, was gut/schlecht lief).

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
- **Nie committen:** `.claude/`, `.mcp.json`, `CLAUDE.md`, `skills-lock.json` (Tooling, absichtlich untracked).
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
- ⚠️ **Migrations-Zeitstempel-Kollision:** diese Datei heißt `20260810140000_…` wie
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
1. **e2e am 2026-08-10 ausgeführt — 19 von 28 rot, beide Ursachen liegen NICHT im Code:**
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
2. **Cross-Device: für Reset erledigt, für Magic Link weiter offen.** Am 2026-08-10 wurde **nur** das
   *Reset-Password*-Template auf die `token_hash`-Form umgestellt (bewusst, das Magic-Link-Template ist
   eine eigene Entscheidung). ⚠️ **Und dabei fiel eine Annahme in §6 um:** der Token in der Mail trägt
   weiterhin das Präfix `pkce_`, **öffnet aber trotzdem in jedem Browser**. Empirisch geprüft, nicht
   hergeleitet. Das Präfix bindet nur den `?code=`-Pfad über `exchangeCodeForSession`; `verifyOtp` mit
   `token_hash` braucht den Verifier nicht. Wer den Magic Link umstellt, sollte also nicht mit
   „PKCE geht sowieso nicht cross-device" argumentieren — der Grund ist allein die Linkform.
3. **39 verwaiste Storage-Objekte** im Bucket `consent-signatures` (Stand 2026-08-10: 54 Objekte, davon 39 ohne zugehörige `consents`-Zeile — Reste gelöschter Test-Teilnehmer). Per SQL nicht löschbar (Supabase blockt mit „Use Storage API"), nur über Dashboard/Service-Role. ⚠️ Das sind **Unterschriften von Erziehungsberechtigten** — Datenminimierung spricht dafür, sie wegzuräumen, nicht liegen zu lassen. Prüfquery: `select count(*) from storage.objects o where bucket_id='consent-signatures' and not exists (select 1 from consents c where c.signature_path = o.name);`
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
16. **Das Aufstellungs-Formular ist nie in einem Browser geöffnet worden.** Unit- und Komponententests
    sind grün (`add-participant-form.test.tsx`), die RLS ist gegen die Live-DB bewiesen, aber die
    Organizer-Seiten verlangen einen Login — den kann ein Agent nicht führen. Erster Handgriff für
    den nächsten Menschen: 3v3-Turnier → *Teilnehmer → Team nachmelden* → drei Zeilen müssen
    erscheinen (Captain, Spieler 2, Spieler 3).
17. **Kein e2e deckt die neuen Funktionen ab** — Nachmeldung, Live-Steuerung in der Matchliste und
    der Regenerate-Riegel haben keine Spec. Der Riegel wäre der lohnendste: er ist die einzige Stelle,
    an der ein Fehlklick unwiederbringlich Daten kostet, und ein Test dafür braucht nur ein Fixture
    mit einem freigegebenen Ergebnis. ⚠️ Vorher §7.1 lesen — die Suite hat gerade eigene Probleme.
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

16. **Fotoerlaubnis — was bewusst fehlt** (siehe §5): **kein Widerruf** (eine erteilte Erlaubnis lässt
    sich in der App nicht zurückziehen oder löschen — DSGVO-seitig der nächste ehrliche Handgriff),
    **kein Nachtragen** (weder auf `/me` noch am Check-in-Tresen, wenn jemand vor Ort das Papier
    unterschreibt) und **kein Sammel-Export** außer dem Ausdruck. Alles drei war beim Bau explizit
    abgewählt, nicht vergessen.
17. **Vier alte `consents`-Zeilen ohne Anschrift und Wortlaut** (erteilt vor dem 2026-08-10, im
    EA-Sports-Turnier: Linus Augsten, Maxi, Nico, Supermats1). Der Ausdruck zeigt für sie „wohnhaft —"
    und den Alt-Satz. Nicht nachträglich auffüllen — was nicht erhoben wurde, wurde nicht erhoben.

### Neu offen aus dem 2026-08-11

19. 🟡 **Die Übernahme ist nie im Browser durchgeklickt worden.** Datenbankseite ist vollständig
    bewiesen (§5.1), Wortlaute und Countdown-Pause sind getestet — der Klickweg an der Tür nicht: der
    Scanner liegt hinter dem Login, und ein Agent kann sich nicht anmelden. **Der eine Durchlauf, der
    zählt:** denselben alten QR zweimal hintereinander scannen. Es darf **keine** zweite Zeile
    entstehen. Genau dafür wird die Konto-Id mitkopiert, und genau das kann still falsch sein.
20. 🟡 **Kein e2e für die Übernahme.** Es bräuchte zwei Turniere und eine Quelle mit Konto —
    aufwendiger als die bisherigen Fixtures, aber es ist der Pfad, der eine fremde Konto-Id schreibt.
21. 🟢 **Der Referee-Pfad ist nur simuliert bewiesen.** Es existiert kein einziges Profil mit Rolle
    `referee` (drei Admins, ein Organizer). Für den Beweis wurde in einer zurückgerollten Transaktion
    ein Organizer herabgestuft. Sobald ein echter Schiedsrichter angelegt ist, einmal wirklich scannen
    lassen.
22. 🟢 **Übernahme ohne Konto ist nicht möglich** und das ist eine bewusste Grenze, kein Bug (§5.1).
    Wer sie aufheben will, muss zuerst beantworten, was der alte QR danach tun soll — der Token ist
    unique, kopieren geht nicht.
23. 🟡 **`allow_carry_over` steht seit dem 2026-08-11 auf `true`** (vom User zum Test gesetzt). Wenn
    turnierübergreifende Codes nicht dauerhaft gelten sollen: Haken unter *Organisation* wieder raus.

### Neu offen aus dem Person/Team-Umbau (2026-08-11)

24. 🔴 **`tournaments.team_size` lässt sich ändern, nachdem sich Leute angemeldet haben — und rechnet
    nichts um.** `updateTournament` (`organizer/tournaments/actions.ts`, ~Z. 101–124) sperrt bei
    vorhandenen Partien nur `game_id` und `format`, `team_size` **nicht einmal dann**. Der Typ einer
    Anmeldung wird aber nur beim INSERT abgeleitet. Folge: 3 → 1 lässt die Personen als `player`
    stehen (keine Wettkämpfer, im Baum stehen die Team-Zeilen), 1 → 3 lässt `solo`-Zeilen als
    Einzelstarter im Baum — in beiden Fällen mischen sich Teams und Einzelspieler. **Riegel gehört in
    die Server Action, nicht nur ins Formular.** Der User hat das nach dem Turnier eingeplant; eine
    vorbereitete Aufgabe mit Fundstellen läuft bereits als eigene Session.
25. 🟡 **Nicht durchgeklickt: Teams-Screen, Restspieler-Panel, Sammel-Freigabe.** Alle drei liegen
    hinter dem Orga-Login, das ein Agent nicht hat. Anmeldung und Team-Beitritt sind auf Produktion
    bewiesen (§5), diese drei nicht. **Besonders offen:** ob das Ziehen per Pointer-Events auf einem
    echten Tablet trägt. Fallback ist eingebaut — neben jedem Spieler ein Auswahlfeld „verschieben
    nach …", das denselben Weg nimmt.
26. 🟡 **Wird ein Team bei 3/3 eingecheckten Spielern wirklich von selbst spielbereit?** Der Trigger
    `sync_team_ready` ist in einer zurückgerollten Transaktion belegt, aber nie mit drei echten
    Check-ins gelaufen. **Notausgang, falls nicht:** auf der Check-in-Seite gibt es pro Team einen
    „Spielbereit"-Knopf (setzt `checked_in_at` auf der Team-Zeile, genau das prüft die Bracket-Quelle).
27. 🟡 **`team_members` steht noch.** Der Umzug (`20260811094000`) hat kopiert, nicht gelöscht — die
    Tabelle ist der Rückweg. Nichts liest oder schreibt sie noch. **Droppen, sobald eine Turnierrunde
    sauber gelaufen ist**, in einer eigenen Mini-Migration. Rückweg bis dahin:
    `delete from participants where type = 'player' and user_id is null;`
28. 🟡 **Geburtsdatum ist vor dem Schiedsrichter nur in der Oberfläche versteckt**, nicht in der
    Datenbank. Spaltenrechte gelten pro Postgres-Rolle, und alle drei App-Rollen **sind** dieselbe
    Rolle `authenticated`. Eine echte Trennung braucht eine View oder eine DEFINER-Funktion mit fester
    Spaltenauswahl. Steht so auch im Code und in `20260811110000`.
29. 🟡 **`E2E_ORG_EMAIL` / `E2E_ORG_PASSWORD` in `.env.local` sind ungültig** („Invalid login
    credentials"). Seit die Registrierungs-Specs ihr **eigenes** Wegwerf-Turnier anlegen (statt sich
    das erstbeste offene zu greifen), brauchen sie Staff-Rechte und scheitern ohne gültige Zugangsdaten
    in `beforeAll`. Erneuern → dann läuft auch der neue `register-team.spec.ts`, der als Einziger den
    Team-Beitritt end-to-end prüft.
30. 🟢 **„Partie starten" kann nur starten, nicht zählen oder beenden.** `start_match_as_player`
    (`20260811130000`) setzt `status='live'`. Zählen bleibt beim Scorekeeper (ein zweiter paralleler
    Zähler würde ihn überschreiben), Beenden auch (daraus baut `scorePrefill` den Freigabe-Vorschlag,
    und die Einigkeit der Spieler hat ohnehin Vorrang). Bewusst so, kein fehlendes Feature.
31. 🟢 **Das Realtime-Abo auf `match_reports` läuft ungefiltert**, weil die Tabelle keine
    `tournament_id` hat. Ein Organizer mit Parallelturnieren bekommt überflüssige Refreshes. Harmlos
    (RLS bleibt), sauber wäre eine denormalisierte `tournament_id`.
32. 🟡 **Token-Modus + Team + alle Partien gespielt = leere Partienliste.** `get_participant_by_qr_token`
    liefert kein `team_id`, deshalb leitet `/me` den Wettkämpfer aus dem *offenen* Match ab. Gibt es
    keins mehr, fällt es auf die Person-Zeile zurück und findet nichts. Einzeiler: `team_id` in den
    Rückgabewert der Funktion aufnehmen. Einzelstarter sind nicht betroffen.

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
