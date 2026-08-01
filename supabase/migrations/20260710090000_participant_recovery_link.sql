-- Guest recovery link: a guest participant has no email/password, so the only
-- way back to their QR code / status page today is the Supabase anonymous-auth
-- session cookie in the ORIGINAL browser. Close the tab, switch devices, or
-- clear cookies and the participant is permanently locked out — no recovery.
--
-- qr_token is already the participant's bearer credential (staff scan the raw
-- token to check them in; see 20260618090000_checkin.sql). Extending that same
-- credential to also unlock a read-only view of "/t/[id]/me" is the same trust
-- model, not a new exposure: only someone who already holds the token (shown on
-- their own device, or a link they saved/shared) can call this. It returns just
-- the participant's own safe, non-PII fields — no birthdate, no user_id, no seed.
create or replace function public.get_participant_by_qr_token(p_qr_token uuid)
returns table (
  id uuid,
  tournament_id uuid,
  display_name text,
  qr_token uuid,
  checked_in_at timestamptz,
  has_consent boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.tournament_id,
    p.display_name,
    p.qr_token,
    p.checked_in_at,
    exists (select 1 from consents c where c.participant_id = p.id) as has_consent
  from participants p
  where p.qr_token = p_qr_token;
$$;

grant execute on function public.get_participant_by_qr_token(uuid) to anon, authenticated;
