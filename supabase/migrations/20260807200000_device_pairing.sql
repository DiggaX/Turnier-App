-- Pair a phone with a staff account by scanning a QR shown on an already
-- signed-in screen, instead of going through a magic link e-mail every time.
--
-- The QR carries a short-lived one-shot token. Whoever redeems it gets a real
-- session for the issuing account, so the token IS the credential: it lives for
-- two minutes, burns on first use, and only ever names the account that created
-- it. Only the hash is stored, so a dump of this table yields nothing usable.

create table if not exists public.device_pairings (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the token from the QR. Never store the token itself.
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_user_agent text
);

comment on table public.device_pairings is
  'One-shot QR tokens for signing a second device into a staff account. Server-only: RLS is on with no policies, so PostgREST reaches nothing. Reads and writes go through the service role in the pairing route.';

create index if not exists device_pairings_open_idx
  on public.device_pairings (expires_at)
  where claimed_at is null;

-- Deliberately no policies. The browser must never see or touch this table; the
-- pairing route holds the service role and authorises in code.
alter table public.device_pairings enable row level security;

-- ── Signed-in devices ────────────────────────────────────────────────────────
-- auth.sessions already records one row per device with user agent and IP, so
-- there is nothing of our own to keep in sync. These two functions expose only
-- the caller's own rows.

create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_seen_at timestamp,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.created_at,
    s.refreshed_at,
    s.user_agent,
    host(s.ip),
    s.id::text = (auth.jwt() ->> 'session_id')
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.refreshed_at desc nulls last, s.created_at desc
$$;

comment on function public.my_sessions is
  'The caller''s own signed-in devices. SECURITY DEFINER because auth.sessions is not readable by authenticated; the auth.uid() filter is what keeps it to the caller.';

create or replace function public.revoke_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The user_id predicate is the authorisation: without it this would hand any
  -- signed-in user the ability to sign out anybody. auth.refresh_tokens cascades
  -- off this row, so the device cannot refresh again; its current access token
  -- stays valid until it expires on its own.
  delete from auth.sessions
  where id = p_session_id and user_id = auth.uid();
end;
$$;

comment on function public.revoke_session is
  'Sign one of the caller''s own devices out. Scoped to auth.uid() — a foreign session id is a no-op, not an error.';

revoke all on function public.my_sessions() from public, anon;
revoke all on function public.revoke_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_session(uuid) to authenticated;

-- ── Correction, same day ─────────────────────────────────────────────────────
-- auth.sessions records the user agent of whoever called GoTrue. With
-- server-side auth that is our own Next.js server, so every row read "node" and
-- the IP was the server's — both useless as a device label, and worse, wrong.
-- The real user agent is the one we capture when the QR is redeemed, so tie the
-- pairing row to the session it produced and label from there. Sessions that
-- came from an e-mail link or a password have no pairing row and say so.

alter table public.device_pairings
  add column if not exists session_id uuid;

create index if not exists device_pairings_session_idx
  on public.device_pairings (session_id)
  where session_id is not null;

drop function if exists public.my_sessions();

create function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_seen_at timestamp,
  user_agent text,
  paired boolean,
  is_current boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.created_at,
    s.refreshed_at,
    dp.claimed_user_agent,
    dp.id is not null,
    s.id::text = (auth.jwt() ->> 'session_id')
  from auth.sessions s
  left join public.device_pairings dp on dp.session_id = s.id
  where s.user_id = auth.uid()
  order by s.refreshed_at desc nulls last, s.created_at desc
$$;

revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;
