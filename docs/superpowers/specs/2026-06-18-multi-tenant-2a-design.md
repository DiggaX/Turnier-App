# Multi-Tenancy Phase 2a — Org-Fundament + Isolation (Design)

**Datum:** 2026-06-18
**Status:** Spec (zur Review)
**Modul:** 2 (Multi-Tenancy), Phase **2a von 2**.

## Ziel

Die App wird **mandantenfähig (multi-tenant)**: jede Firma ist eine **Organisation**, jeder Staff-Account gehört zu genau einer Org, jedes Turnier gehört einer Org. Das Management ist **isoliert** — eine Firma sieht/verwaltet ausschließlich ihre eigenen Turniere. Öffentlich bekommt jede Firma eine eigene Seite `/o/<slug>` (White-Label, „eigener Kosmos"). Bestehende Daten (Sommer Cup + `test@test.de`) wandern in eine Default-Org „Eventpilot".

## Scope & Abgrenzung

**Phase 2a (dieser Spec):** Org-Datenmodell, `org_id`-Scoping, **RLS-Isolation** (sicherheitskritisch), `/o/<slug>`-Öffentlichseite, Home → Landing, Backfill bestehender Daten. Orgs + Staff-Accounts werden in 2a **von mir per db2** angelegt (kein öffentliches Signup).

**Phase 2b (späterer, eigener Spec):** Self-Service-Signup (Firma anlegen), Invite-Links mit Rolle, Mitglieder-Verwaltung. **Nicht Teil von 2a.**

**Bewusst raus (2a):** Self-Service-Signup/Invites; per-Org-Branding/Logos; per-Org-Spiele (Games bleiben **ein gemeinsamer globaler Katalog** — `team_size` ist eh pro Turnier); Org-Umschalter (1 User = 1 Org).

## Datenmodell (eine Migration)

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,        -- für /o/<slug>; lowercase, [a-z0-9-]
  created_at timestamptz not null default now()
);
alter table organizations enable row level security;
create policy "orgs_select_public" on organizations for select using (true);
create policy "orgs_write_staff_same_org" on organizations for all
  using (public.is_staff() and id = public.current_org_id())
  with check (public.is_staff() and id = public.current_org_id());

alter table profiles    add column org_id uuid references organizations (id) on delete set null;  -- nullable: Superadmin = null
alter table tournaments add column org_id uuid references organizations (id) on delete cascade;   -- befüllt + NOT NULL nach Backfill

-- SECURITY DEFINER: org_id des aktuellen Users (umgeht profiles-RLS bewusst).
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;
```

**Backfill (gleiche Migration):** Default-Org anlegen + alle bestehenden Profiles/Tournaments zuordnen, dann `tournaments.org_id` auf NOT NULL.

```sql
with org as (
  insert into organizations (name, slug) values ('Eventpilot', 'eventpilot')
  on conflict (slug) do update set name = excluded.name
  returning id
)
update profiles    set org_id = (select id from org) where org_id is null;
update tournaments set org_id = (select id from org) where org_id is null;
alter table tournaments alter column org_id set not null;
```

## RLS-Isolation (das Kritische)

`current_org_id()` ist die Basis. Public-`select` bleibt überall offen (öffentliche Seiten lesen per Slug/Turnier-ID). Geändert werden die **Staff-Write/Manage-Scopes**:

- **tournaments** — `tournaments_write_staff` von `is_staff()` → `is_staff() and org_id = public.current_org_id()` (using **und** with check). Staff schreibt nur Turniere der eigenen Org; INSERT erzwingt die eigene org_id.
- **matches** — `matches_write_staff` von `is_staff()` → `is_staff() and exists (select 1 from tournaments t where t.id = matches.tournament_id and t.org_id = public.current_org_id())`. (Public select bleibt.)
- **participants** — der **Staff-Teil** der Policies (`participants_*_owner_or_staff`) wird von `public.is_staff()` → `(public.is_staff() and exists (select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id()))`. Der **Owner-Teil** (`user_id = auth.uid()`, Spieler-Selbstanmeldung) bleibt **unverändert** — Spieler sind org-los.
- **organizations** — siehe oben (eigene Org editierbar).
- **games** — **unverändert** (`is_staff()`, global geteilt).
- **profiles** — `select_own`/`update_own` bleiben (2a braucht keine Member-Liste; 2b ergänzt org-Member-Select).

> Verteidigung in der Tiefe: die Organizer-Server-Queries filtern zusätzlich auf `current_org_id()`, aber die RLS ist die echte Grenze.

## App-Änderungen

- **Organizer-Bereich** (`/organizer`, `/organizer/tournaments/...`): Die Turnier-Liste lädt nur Turniere der eigenen Org (RLS reicht, aber explizit `.eq("org_id", …)` für Klarheit — oder schlicht RLS-gefiltert). `createTournament` setzt `org_id = current_org_id()` (Server-Action liest die eigene org_id). Games-Verwaltung bleibt (globaler Katalog).
- **Öffentliche Org-Seite** `/o/[slug]/page.tsx`: lädt die Org per Slug (`notFound` wenn unbekannt), listet deren Turniere (wie die heutige Home-Liste, aber `where org_id = org.id`). Verlinkt auf `/t/<id>`-Detail/Anmeldung/Board (unverändert, turnier-id-basiert).
- **Home** `/` → **Landing**: kurzer Pitch + Liste der Organisationen (jede verlinkt auf `/o/<slug>`), damit Spieler ihre Firma finden. (Die bisherige Turnier-Liste lebt jetzt pro Org unter `/o/<slug>`.)
- **Brand:** ein `current_org_id()`-Typ + `organizations`/`org_id` in `database.types.ts`.

## Bestehende Daten

Die Migration legt „Eventpilot" (slug `eventpilot`) an und ordnet `test@test.de` + Sommer Cup (alle bisherigen Turniere/Profiles) zu. Sommer Cup ist danach unter `/o/eventpilot` erreichbar. **Ich wende die Migration per db2 an + verifiziere** (db2 ist verbunden), kein manueller Schritt für dich.

## Fehlerbehandlung
Server-Actions bleiben `requireStaff`-gated; zusätzlich scopt die RLS auf die Org. `/o/<slug>` → `notFound` bei unbekanntem Slug. `createTournament` ohne org_id (Superadmin/orglos) → freundlicher Fehler „Kein Org-Kontext".

## Tests
- **Unit (Vitest):** ein Slug-Helper `orgSlug(name)` (slugify: lowercase, `[a-z0-9-]`, kollapsierte Bindestriche) per TDD — wird in 2b fürs Signup gebraucht, in 2a für konsistente Slugs.
- **Isolations-Test (kritisch):** ein DB-Integrationstest *oder* dokumentierter db2-Check, dass Org-A-Staff Org-B-Turniere **nicht** schreiben kann (RLS). Mind. als verifizierter db2-Query-Beleg im Done-Kriterium.
- **e2e:** Org-Seite `/o/eventpilot` zeigt Sommer Cup; Home zeigt die Org-Liste. (Organizer-Isolation e2e braucht zwei Org-Accounts → eher db2-verifiziert in 2a, voll-e2e in 2b mit Signup.)

## Done = alle wahr
`organizations` + `org_id` (profiles, tournaments) + `current_org_id()` migriert (von mir per db2 angewandt + verifiziert); bestehende Daten in „Eventpilot"; RLS isoliert Staff-Management strikt nach Org (tournaments/matches/participants/organizations), Games bleiben global, Public-Read offen; Organizer sieht/legt nur Org-eigene Turniere an; `/o/<slug>` zeigt Org-Turniere; Home ist Landing + Org-Liste; Slug-Helper unit-getestet; Isolation per db2 nachgewiesen; build + unit grün.
```
