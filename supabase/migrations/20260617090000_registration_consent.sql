-- Enums
create type participant_type as enum ('solo', 'team');
create type consent_grantor as enum ('self', 'guardian');

-- staff check helper (organizer/admin/referee have a profiles row with such role)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','organizer','referee')
  );
$$;

create table participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  type participant_type not null default 'solo',
  display_name text not null,
  gamertag text,
  birthdate date not null,
  seed int,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  name text not null,
  gamertag text,
  is_captain boolean not null default false,
  created_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  grantor consent_grantor not null,
  grantor_name text not null,
  method text not null check (method in ('checkbox','signature')),
  signature_path text,
  granted_at timestamptz not null default now()
);

alter table participants enable row level security;
alter table team_members enable row level security;
alter table consents enable row level security;

-- participants: owner (the registering auth user) manages own; staff read all
create policy "participants_select_owner_or_staff" on participants
  for select using (user_id = auth.uid() or public.is_staff());
create policy "participants_insert_self" on participants
  for insert with check (user_id = auth.uid());
create policy "participants_update_owner_or_staff" on participants
  for update using (user_id = auth.uid() or public.is_staff());

-- team_members: managed by the owner of the parent participant; staff read
create policy "team_members_select" on team_members
  for select using (
    public.is_staff() or exists (
      select 1 from participants p where p.id = participant_id and p.user_id = auth.uid()
    )
  );
create policy "team_members_write_owner" on team_members
  for all using (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  );

-- consents: owner inserts/reads own; staff read
create policy "consents_select" on consents
  for select using (
    public.is_staff() or exists (
      select 1 from participants p where p.id = participant_id and p.user_id = auth.uid()
    )
  );
create policy "consents_insert_owner" on consents
  for insert with check (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  );

-- Storage RLS for the private 'consent-signatures' bucket:
-- a user may upload/read files under a path prefixed with their own uid; staff may read all.
create policy "sig_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'consent-signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "sig_select_own_or_staff" on storage.objects
  for select to authenticated using (
    bucket_id = 'consent-signatures'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- Seed: one open tournament to register into
insert into tournaments (name, game_id, format, mode, status)
select 'Sommer Cup 2026', g.id, 'single_elim', 'hybrid', 'registration'
from games g where g.name = 'Valorant'
on conflict do nothing;
