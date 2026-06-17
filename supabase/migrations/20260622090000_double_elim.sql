-- Plan 7: Double Elimination — bracket tag + loser-advancement links on matches.
-- Idempotent (ignore already-existing columns on re-run).
alter table matches add column if not exists bracket text not null default 'winner'
  check (bracket in ('winner','loser','grand_final'));
alter table matches add column if not exists loser_next_match_id uuid references matches (id) on delete set null;
alter table matches add column if not exists loser_next_slot char(1) check (loser_next_slot in ('a','b'));
