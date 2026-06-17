-- Plan 6: Live-Board — enable Supabase Realtime so the public board receives match updates.
-- Idempotent: ignores "already member" (Supabase may add tables to the publication by default).
do $$ begin
  alter publication supabase_realtime add table matches;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table tournaments;
exception when duplicate_object then null; end $$;
