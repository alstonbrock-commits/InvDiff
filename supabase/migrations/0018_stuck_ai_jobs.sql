-- 0018: reap AI jobs that never finished.
--
-- generate-insights marks its own job errored when it throws, but a job can
-- also die without ever reaching that catch — the edge runtime kills the
-- worker (546 WORKER_RESOURCE_LIMIT) and the row stays 'processing' forever.
-- The Insights tab treats queued/processing as "ANALYSING", so a killed job
-- leaves an event spinning even though its report generated fine on a retry.
--
-- A synthesis run takes about a minute, so anything still running after 15 is
-- dead.

create or replace function reap_stale_ai_jobs() returns void
language sql security definer set search_path = public as $$
  update ai_jobs
  set status = 'error',
      error = coalesce(error, 'worker stopped before the job finished'),
      updated_at = now()
  where status in ('queued', 'processing')
    and created_at < now() - interval '15 minutes';
$$;

select cron.schedule(
  'reap-stale-ai-jobs',
  '*/10 * * * *',
  $$select reap_stale_ai_jobs();$$
);

-- Clear the ones already stranded.
select reap_stale_ai_jobs();
