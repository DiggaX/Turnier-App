-- Staff can now check someone in from the attendance list — for the person
-- whose QR is unreadable or whose phone is dead. Named honestly instead of
-- reusing a scan value, so the audit trail keeps telling the truth.
--
-- No guard change needed: check_in treats every method outside the
-- self-service allowlist ('station', 'online') as staff-only.
alter type checkin_method add value if not exists 'manual';
