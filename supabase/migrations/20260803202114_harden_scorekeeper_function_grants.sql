-- Supabase grants EXECUTE broadly by default. Revoke explicitly from anon and
-- authenticated first, then grant back only the intended RPC surface.
revoke all on function public.create_match_scorekeeper_token()
  from public, anon, authenticated;

revoke all on function public.get_scorekeeper_match(uuid)
  from public, anon, authenticated;
revoke all on function public.start_live_match(uuid)
  from public, anon, authenticated;
revoke all on function public.update_live_score(uuid, int, int)
  from public, anon, authenticated;
revoke all on function public.finish_live_match(uuid, int, int)
  from public, anon, authenticated;
revoke all on function public.reopen_live_match(uuid)
  from public, anon, authenticated;
revoke all on function public.get_scorekeeper_tokens(uuid[])
  from public, anon, authenticated;

grant execute on function public.get_scorekeeper_match(uuid)
  to anon, authenticated;
grant execute on function public.start_live_match(uuid)
  to anon, authenticated;
grant execute on function public.update_live_score(uuid, int, int)
  to anon, authenticated;
grant execute on function public.finish_live_match(uuid, int, int)
  to anon, authenticated;
grant execute on function public.reopen_live_match(uuid)
  to anon, authenticated;

grant execute on function public.get_scorekeeper_tokens(uuid[])
  to authenticated;
