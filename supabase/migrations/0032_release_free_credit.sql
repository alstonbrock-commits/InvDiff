-- 0032: safe free-credit release (T-rex follow-up on 0031's claim protocol).
--
-- The claim in generate-insights is reverted when a run fails — but with two
-- concurrent runs by a subscriber, the FAILING run can hold the stamp while
-- the OTHER run's report succeeded (it proceeded under the subscription and
-- never stamped). A blind revert would then clear the only stamp, leaving a
-- persisted report alongside an apparently unused free credit.
--
-- The release is therefore one atomic statement that only returns the credit
-- when the stamp is exactly ours AND the owner has no persisted report at
-- all — which is precisely what free_report_used_at means.

create or replace function public.release_free_credit(
  p_user  uuid,
  p_stamp timestamptz
) returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update profiles p
       set free_report_used_at = null
     where p.id = p_user
       and p.free_report_used_at = p_stamp
       and not exists (
         select 1
           from event_reports er
           join events e on e.id = er.event_id
          where e.owner_id = p_user
       )
    returning p.id
  )
  select exists (select 1 from released);
$$;

revoke all on function public.release_free_credit(uuid, timestamptz) from public;
revoke all on function public.release_free_credit(uuid, timestamptz) from anon;
revoke all on function public.release_free_credit(uuid, timestamptz) from authenticated;
grant execute on function public.release_free_credit(uuid, timestamptz) to service_role;
