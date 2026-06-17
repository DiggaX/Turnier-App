-- Plan 10 quality fix: add missing UPDATE policy for push_subscriptions.
-- An upsert with onConflict:"endpoint" issues a Postgres UPDATE when the
-- endpoint already exists. Without an UPDATE policy, RLS denies that path
-- and re-subscribing a known endpoint always fails.
create policy "push_sub_owner_update" on push_subscriptions
  for update
  using (
    exists (select 1 from participants p
            where p.id = participant_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from participants p
            where p.id = participant_id and p.user_id = auth.uid())
  );
