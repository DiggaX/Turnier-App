-- Plan 9: Groups -> Playoffs. Tag each group-stage match with its group number;
-- playoff matches leave it NULL. Idempotent (ignore an already-existing column).
alter table matches add column if not exists group_no int;
