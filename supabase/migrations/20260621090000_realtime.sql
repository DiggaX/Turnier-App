-- Plan 6: Live-Board — enable Supabase Realtime so the public board receives match updates.
-- (Run once on the project; if a table is already in the publication, run the lines individually.)
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table tournaments;
