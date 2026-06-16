-- Enums
create type user_role as enum ('admin', 'organizer', 'referee');
create type tournament_format as enum ('single_elim', 'round_robin', 'double_elim', 'swiss', 'groups_playoffs');
create type tournament_mode as enum ('lan', 'online', 'hybrid');
create type tournament_status as enum ('draft', 'registration', 'running', 'finished');

-- profiles: one row per auth user (organizer/admin/referee)
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'organizer',
  display_name text,
  created_at timestamptz not null default now()
);

-- games: catalog of playable titles
create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_size int not null default 1 check (team_size >= 1),
  created_at timestamptz not null default now()
);

-- tournaments
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_id uuid not null references games (id),
  format tournament_format not null,
  mode tournament_mode not null default 'hybrid',
  status tournament_status not null default 'draft',
  starts_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;
alter table games enable row level security;
alter table tournaments enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

create policy "games_select_public" on games for select using (true);
create policy "games_write_authenticated" on games for all to authenticated using (true) with check (true);

create policy "tournaments_select_public" on tournaments for select using (true);
create policy "tournaments_write_authenticated" on tournaments for all to authenticated using (true) with check (true);

-- Seed games (idempotent)
insert into games (name, team_size) values ('Valorant', 5), ('FIFA', 1)
on conflict do nothing;
