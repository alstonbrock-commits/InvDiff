-- 0031: report generation hardening (from the production code review).
--
-- 1. replace_event_report(): the report + insights + recommendations swap
--    happens in ONE transaction. Previously generate-insights deleted the old
--    insights and then issued independent unchecked writes — a failure partway
--    could leave the event with no report (or a partial one) while the job
--    still read 'done' and the source audio was purged.
-- 2. A partial unique index so only one insights job can be active per event:
--    the function's check-then-insert had a window where two concurrent
--    requests both started, interleaving deletes and inserts of the same rows.

-- The pre-index schema allowed duplicate active jobs (the very race this
-- migration closes), so resolve any survivors first or the index creation
-- itself would abort the deploy: keep the newest active job per event, mark
-- the rest superseded. (Applied environments already passed this cleanly —
-- this guard is for fresh applies of the whole chain.)
update ai_jobs a
   set status = 'error',
       error  = 'superseded: duplicate active job resolved by migration 0031'
 where a.type = 'insights'
   and a.status in ('queued', 'processing')
   and exists (
     select 1 from ai_jobs b
      where b.event_id = a.event_id
        and b.type = 'insights'
        and b.status in ('queued', 'processing')
        and (b.created_at > a.created_at
             or (b.created_at = a.created_at and b.id > a.id))
   );

create unique index if not exists ai_jobs_one_active_insights
  on ai_jobs (event_id)
  where type = 'insights' and status in ('queued', 'processing');

create or replace function public.replace_event_report(
  p_event_id        uuid,
  p_report          jsonb,
  p_insights        jsonb,
  p_recommendations jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins        jsonb;
  v_rec        jsonb;
  v_id         uuid;
  v_pos        int := 0;
  v_ids        uuid[] := '{}';
  v_numbers    int[]  := '{}';
  v_target     uuid;
  v_rec_pos    int := 0;
  v_idx        int;
begin
  -- Old report out (recommendations cascade from insights).
  delete from insights where event_id = p_event_id;

  insert into event_reports (
    event_id, event_description, executive_summary, limitations, next_steps,
    data_quality_note, internal_quality_note, facilitator_name,
    interviews_reviewed, roles_reviewed, generated_by_model, generated_at,
    updated_at
  ) values (
    p_event_id,
    coalesce(p_report->>'event_description', ''),
    coalesce(p_report->>'executive_summary', ''),
    p_report->>'limitations',
    coalesce(p_report->'next_steps', '[]'::jsonb),
    p_report->>'data_quality_note',
    p_report->>'internal_quality_note',
    p_report->>'facilitator_name',
    coalesce((p_report->>'interviews_reviewed')::int, 0),
    coalesce(p_report->'roles_reviewed', '[]'::jsonb),
    p_report->>'generated_by_model',
    now(),
    now()
  )
  on conflict (event_id) do update set
    event_description     = excluded.event_description,
    executive_summary     = excluded.executive_summary,
    limitations           = excluded.limitations,
    next_steps            = excluded.next_steps,
    data_quality_note     = excluded.data_quality_note,
    internal_quality_note = excluded.internal_quality_note,
    facilitator_name      = excluded.facilitator_name,
    interviews_reviewed   = excluded.interviews_reviewed,
    roles_reviewed        = excluded.roles_reviewed,
    generated_by_model    = excluded.generated_by_model,
    generated_at          = excluded.generated_at,
    updated_at            = excluded.updated_at;

  -- Insights, in array order. Remember id + insight_number for the
  -- recommendation links below.
  for v_ins in select * from jsonb_array_elements(coalesce(p_insights, '[]'::jsonb))
  loop
    v_pos := v_pos + 1;
    insert into insights (
      event_id, position, title, body, theme, system_significance,
      supporting_examples, status, generated_by_model, generated_at
    ) values (
      p_event_id,
      v_pos,
      coalesce(v_ins->>'title', ''),
      coalesce(v_ins->>'body', ''),
      v_ins->>'theme',
      v_ins->>'system_significance',
      coalesce(v_ins->'supporting_examples', '[]'::jsonb),
      'draft',
      v_ins->>'generated_by_model',
      now()
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_numbers := v_numbers || coalesce((v_ins->>'insight_number')::int, v_pos);
  end loop;

  -- Recommendations: link by insight_number, falling back to the first
  -- insight; skipped entirely when there are no insights to hang them on.
  if array_length(v_ids, 1) is not null then
    for v_rec in select * from jsonb_array_elements(coalesce(p_recommendations, '[]'::jsonb))
    loop
      v_rec_pos := v_rec_pos + 1;
      v_target := v_ids[1];
      v_idx := array_position(v_numbers, (v_rec->>'linked_insight_number')::int);
      if v_idx is not null then
        v_target := v_ids[v_idx];
      end if;
      insert into recommendations (
        insight_id, body, risk_reduction_rationale, verification_method,
        is_option, position, status
      ) values (
        v_target,
        coalesce(v_rec->>'body', ''),
        v_rec->>'risk_reduction_rationale',
        v_rec->>'verification_method',
        coalesce((v_rec->>'is_option')::boolean, false),
        v_rec_pos,
        'draft'
      );
    end loop;
  end if;
end;
$$;

-- Service-role only, like the other server-side helpers (0029).
revoke all on function public.replace_event_report(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.replace_event_report(uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function public.replace_event_report(uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.replace_event_report(uuid, jsonb, jsonb, jsonb) to service_role;
