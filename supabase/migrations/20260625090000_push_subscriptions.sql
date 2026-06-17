-- Plan 10: Web Push. One browser push subscription per (participant, endpoint).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;

-- The participant's own (anon) user may add/read/remove their subscriptions;
-- staff may read + prune them in order to send pushes.
create policy "push_sub_owner_insert" on push_subscriptions for insert
  with check (
    exists (select 1 from participants p
            where p.id = participant_id and p.user_id = auth.uid())
  );
create policy "push_sub_owner_or_staff_select" on push_subscriptions for select
  using (
    exists (select 1 from participants p
            where p.id = participant_id and p.user_id = auth.uid())
    or public.is_staff()
  );
create policy "push_sub_owner_or_staff_delete" on push_subscriptions for delete
  using (
    exists (select 1 from participants p
            where p.id = participant_id and p.user_id = auth.uid())
    or public.is_staff()
  );
