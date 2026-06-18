-- Phase 2b: self-serve org signup + invites + member management.

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null unique,
  role text not null check (role in ('organizer','referee')),
  created_by uuid references profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table org_invites enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "org_invites_admin_same_org" on org_invites;
create policy "org_invites_admin_same_org" on org_invites for all
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

drop policy if exists "profiles_select_same_org" on profiles;
create policy "profiles_select_same_org" on profiles for select
  using (org_id is not null and org_id = public.current_org_id());

create or replace function public.bootstrap_org(p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slug text; v_org uuid; n int := 1;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'bereits einer Organisation zugeordnet'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Firmenname erforderlich'; end if;
  v_slug := nullif(trim(p_slug), '');
  if v_slug is null then raise exception 'Ungueltiger Slug'; end if;
  while exists (select 1 from organizations where slug = v_slug) loop
    n := n + 1;
    v_slug := p_slug || '-' || n;
  end loop;
  insert into organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  insert into profiles (id, role, org_id) values (v_uid, 'admin', v_org);
  return v_slug;
end; $$;
grant execute on function public.bootstrap_org(text, text) to authenticated;

create or replace function public.accept_invite(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inv org_invites; v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'bereits einer Organisation zugeordnet'; end if;
  select * into v_inv from org_invites where code = p_code;
  if v_inv.id is null then raise exception 'Einladung ungueltig'; end if;
  if v_inv.accepted_at is not null then raise exception 'Einladung bereits eingeloest'; end if;
  if v_inv.expires_at < now() then raise exception 'Einladung abgelaufen'; end if;
  insert into profiles (id, role, org_id) values (v_uid, v_inv.role, v_inv.org_id);
  update org_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  select slug into v_slug from organizations where id = v_inv.org_id;
  return v_slug;
end; $$;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.peek_invite(p_code text)
returns table (org_name text, member_role text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role
  from org_invites i join organizations o on o.id = i.org_id
  where i.code = p_code and i.accepted_at is null and i.expires_at > now();
$$;
grant execute on function public.peek_invite(text) to anon, authenticated;

create or replace function public.set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur Admin'; end if;
  if p_role not in ('organizer','referee') then raise exception 'ungueltige Rolle'; end if;
  if p_member = auth.uid() then raise exception 'eigene Rolle nicht aenderbar'; end if;
  update profiles set role = p_role where id = p_member and org_id = public.current_org_id();
  if not found then raise exception 'Mitglied nicht in deiner Organisation'; end if;
end; $$;
grant execute on function public.set_member_role(uuid, text) to authenticated;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur Admin'; end if;
  if p_member = auth.uid() then raise exception 'sich selbst nicht entfernbar'; end if;
  update profiles set org_id = null where id = p_member and org_id = public.current_org_id();
  if not found then raise exception 'Mitglied nicht in deiner Organisation'; end if;
end; $$;
grant execute on function public.remove_member(uuid) to authenticated;
