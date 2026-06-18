# Multi-Tenancy Phase 2b — Self-Service-Signup + Invites + Mitglieder (Design)

**Datum:** 2026-06-18
**Status:** Spec (zur Review)
**Modul:** 2 (Multi-Tenancy), Phase **2b von 2** (Abschluss).

## Ziel

Firmen onboarden sich selbst: Jemand registriert sich → legt seine Firma an → wird deren **Admin**. Der Admin lädt Mitglieder per **Einmal-Invite-Link** (mit Rolle organizer/referee) ein; Eingeladene registrieren sich über den Link → treten der Firma bei. Der Admin verwaltet Mitglieder (Rolle ändern, entfernen) und offene Invites. Baut auf Phase 2a (Org-Modell + Isolation) auf.

## Scope & Abgrenzung

**Phase 2b (dieser Spec):** öffentliches Signup + Firma anlegen, Einmal-Invite-Links, Mitglieder-Verwaltung (Admin). Schließt Modul 2 ab.

**Bewusst raus:** mehrere Admins pro Org / Eigentümer-Transfer; geteilte Dauer-Codes; per-Org-Branding/Logos; E-Mail-Bestätigungs-Flow (Supabase-`email_confirm` bleibt für MVP **aus** → sofort nutzbar nach Signup; späterer Toggle ist ein Auth-Setting, kein Code).

**Annahmen aus 2a:** `organizations(name, slug)`, `profiles(id, role, org_id, display_name)`, `current_org_id()` (SECURITY DEFINER), `orgSlug()` (TS-Helper). Profile haben **keine** INSERT-Policy und es gibt **keinen** auth-Trigger → privilegierte Erstellung läuft über SECURITY DEFINER RPCs.

## Datenmodell (eine Migration, von mir per db2 angewandt + verifiziert)

```sql
create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null unique,                         -- secret, in der Invite-URL
  role text not null check (role in ('organizer','referee')),
  created_by uuid references profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table org_invites enable row level security;
-- Nur Admin der Org sieht/verwaltet die Invites der eigenen Org. KEIN public select
-- (der Code ist das Geheimnis; Einlösen läuft über accept_invite, nicht über Direktlesen).
create policy "org_invites_admin_same_org" on org_invites for all
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
```

- **`public.is_admin()`** — neue SECURITY DEFINER Helper-Funktion analog `is_staff()`: `select exists(select 1 from profiles where id = auth.uid() and role = 'admin')`.
- **`profiles` Read-Policy** `profiles_select_same_org` (zusätzlich zu `select_own`): `using (org_id = public.current_org_id())` — Staff sieht die Mitglieder der eigenen Org (für die Mitglieder-Liste).

### RPCs (alle SECURITY DEFINER, `set search_path = public`)
1. **`bootstrap_org(p_name text, p_slug text) returns text`** — der **eingeloggte** User **ohne** Profil legt eine Firma an: Org einfügen (Slug eindeutig machen — bei Kollision `-2`, `-3`, … anhängen), Profil `(auth.uid(), role 'admin', org_id)` einfügen, Slug zurückgeben. Guard: `auth.uid()` gesetzt **und** noch kein Profil vorhanden (sonst Exception „bereits einer Organisation zugeordnet"). `p_name` nicht leer.
2. **`accept_invite(p_code text) returns text`** — der eingeloggte User **ohne** Profil löst einen Invite ein: Invite per Code laden; Exception wenn nicht gefunden / `expires_at < now()` / `accepted_at` gesetzt; Profil `(auth.uid(), role = invite.role, org_id = invite.org_id)` einfügen; Invite `accepted_at=now(), accepted_by=auth.uid()` setzen; Org-Slug zurückgeben. Guard: kein bestehendes Profil.
3. **`peek_invite(p_code text) returns table(org_name text, role text)`** — anon/authenticated callable: gibt Org-Name + Rolle für einen **gültigen, unbenutzten, nicht abgelaufenen** Code zurück (sonst 0 Zeilen). Nur fürs Anzeigen von „Beitreten zu <Firma> als <Rolle>" auf `/signup` (der Code ist eh in der URL → kein zusätzliches Leck). Kein Schreibzugriff.
4. **`set_member_role(p_member uuid, p_role text) returns void`** — **Admin-only**, gleiche Org: Rolle eines Mitglieds auf organizer/referee setzen. Guards: caller `is_admin()` + Ziel `org_id = current_org_id()`; `p_role in ('organizer','referee')` (Admin-Rolle nicht vergebbar); `p_member <> auth.uid()` (kein Selbst-Downgrade → kein Lockout).
5. **`remove_member(p_member uuid) returns void`** — Admin-only, gleiche Org: `update profiles set org_id = null` (Account + erstellte Turniere via `created_by` bleiben; org-los → kein Org-Zugriff). Guards: `is_admin()` + Ziel gleiche Org; `p_member <> auth.uid()` (Admin entfernt sich nicht selbst).

Alle vier mit `grant execute … to authenticated`.

## App-Änderungen

- **`/signup/page.tsx`** (+ Query `?invite=<code>`): Client-Formular (E-Mail, Passwort; bei „Firma anlegen" zusätzlich Firmenname). Bei vorhandenem `invite`: ruft `peek_invite(code)` und zeigt „Du trittst <Firma> als <Rolle> bei" (oder „Einladung ungültig/abgelaufen", wenn 0 Zeilen). Ablauf: `supabase.auth.signUp` → bei Erfolg (Session da, da email_confirm aus) Server-Action `bootstrapOrg(name, slug)` **oder** `acceptInvite(code)` → Redirect `/organizer`. Slug per `orgSlug(name)` clientseitig vorberechnet, an die Action/RPC übergeben.
- **`/organizer/members/page.tsx`** (Admin-gated — `redirect('/organizer')` wenn nicht admin): Mitglieder-Liste (Anzeigename, Rolle, „du"-Markierung) mit Rolle-Ändern (organizer/referee) + Entfernen pro Zeile (außer sich selbst); „Mitglied einladen"-Form (Rolle + Ablauf-Default 7 Tage) → erzeugt Invite (RLS-Insert) → zeigt den fertigen Link `…/signup?invite=<code>` zum Kopieren; Liste offener Invites (Rolle, Ablauf, Status) mit Widerrufen (delete).
- **Server-Actions**: `bootstrapOrg`, `acceptInvite` (rufen die RPCs), `createInvite`, `revokeInvite`, `setMemberRole`, `removeMember`. `requireStaff`/`requireAdmin`-Guards + `friendlyDbError` + `ActionResult`.
- **Nav** (`organizer-nav.tsx`): „Mitglieder"-Link **nur für Admins**; „Registrieren"-Link auf `/login` → `/signup`. Logout-Button (falls nicht vorhanden).
- **Login-Seite**: Link „Neue Firma? Registrieren" → `/signup`.

## Fehlerbehandlung / Sicherheit
- RPCs sind SECURITY DEFINER + streng geguardet (kein Profil-Overwrite, Admin+gleiche-Org für Member-Ops, kein Selbst-Lockout). Invite-Codes sind Geheimnisse (kein public select; lange Zufalls-Codes). Abgelaufene/genutzte Invites werden abgewiesen. `is_admin()` trennt Admin von organizer/referee. Member-Ops zusätzlich org-gescopt (kein Cross-Org).
- Doppel-Signup / bereits zugeordnet: freundliche Meldung. Slug-Kollision: automatisch disambiguiert.

## Tests
- **Unit (Vitest, TDD):** `dedupeSlug(base, taken[])` (Slug-Disambiguierung, pure) + `inviteCode()` Format/Länge (deterministisch testbar über Vorgabe) bzw. `isInviteUsable(invite, now)` (abgelaufen/genutzt) pure.
- **Isolation/RPC-Beweis (per db2):** simulieren, dass ein Nicht-Admin `set_member_role`/`remove_member` nicht ausführen kann; dass `accept_invite` einen abgelaufenen/genutzten Code abweist; dass ein zweites `bootstrap_org` für denselben User scheitert.
- **e2e:** Signup → Firma anlegen → landet im Organizer; (Invite-Einlösung mit zwei Sessions ist e2e-aufwändig → mind. der Bootstrap-Pfad + die Members-Seite rendern; Invite-Einlösung per db2-Beweis).

## Done = alle wahr
`org_invites` + `is_admin()` + die 4 RPCs + `profiles_select_same_org` migriert (per db2, geguardet-verifiziert); `/signup` legt eine Firma an (User wird Admin) bzw. löst einen Invite ein; `/organizer/members` (Admin) listet Mitglieder, erstellt Invite-Links, ändert Rollen, entfernt Mitglieder, widerruft Invites; kein Selbst-Lockout, kein Cross-Org, kein Profil-Overwrite; Slug-Dedup unit-getestet; build + unit grün; Modul 2 abgeschlossen.
