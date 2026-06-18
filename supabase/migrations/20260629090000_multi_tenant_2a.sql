-- Phase 2a: multi-tenancy foundation + management isolation.

-- 1. organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table organizations enable row level security;
create policy "orgs_select_public" on organizations for select using (true);

-- 2. tenant key columns
alter table profiles    add column if not exists org_id uuid references organizations (id) on delete set null;
alter table tournaments add column if not exists org_id uuid references organizations (id) on delete cascade;

-- 3. current_org_id(): the caller's org (SECURITY DEFINER bypasses profiles RLS).
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- 4. backfill default org + assign all existing rows
with org as (
  insert into organizations (name, slug) values ('Eventpilot', 'eventpilot')
  on conflict (slug) do update set name = excluded.name
  returning id
)
update profiles set org_id = (select id from org) where org_id is null;
update tournaments set org_id = (select id from organizations where slug = 'eventpilot') where org_id is null;
alter table tournaments alter column org_id set not null;

-- 5. organizations write: staff of that org only
drop policy if exists "orgs_write_staff_same_org" on organizations;
create policy "orgs_write_staff_same_org" on organizations for all
  using (public.is_staff() and id = public.current_org_id())
  with check (public.is_staff() and id = public.current_org_id());

-- 6. org-scope the staff write/manage policies
drop policy if exists "tournaments_write_staff" on tournaments;
create policy "tournaments_write_staff" on tournaments for all
  using (public.is_staff() and org_id = public.current_org_id())
  with check (public.is_staff() and org_id = public.current_org_id());

drop policy if exists "matches_write_staff" on matches;
create policy "matches_write_staff" on matches for all
  using (public.is_staff() and exists (
    select 1 from tournaments t where t.id = matches.tournament_id and t.org_id = public.current_org_id()))
  with check (public.is_staff() and exists (
    select 1 from tournaments t where t.id = matches.tournament_id and t.org_id = public.current_org_id()));

-- participants: org-scope the staff parts; keep the owner (player) + anon-board parts.
drop policy if exists "participants_select_owner_or_staff" on participants;
create policy "participants_select_owner_or_staff" on participants for select
  using (user_id = auth.uid() or (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id())));

drop policy if exists "participants_update_owner_or_staff" on participants;
create policy "participants_update_owner_or_staff" on participants for update
  using (user_id = auth.uid() or (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id())));

drop policy if exists "participants_delete_staff" on participants;
create policy "participants_delete_staff" on participants for delete
  using (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id()));

-- games stay GLOBAL (shared catalog) — unchanged.
