// generate-insights: load all transcripts for an event, group them by question,
// and run the client's Event Insights synthesis prompt. Persists the report
// (description, executive summary, limitations, next steps), the insights and
// up to three recommendations in one pass.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { assertActivePlan } from '../_shared/entitlement.ts';
import { purgeEventAudio } from '../_shared/purgeAudio.ts';
import { claudeStructured, CLAUDE_MODEL } from '../_shared/anthropic.ts';
import {
  insightsSystem,
  insightsSchema,
  buildInsightsUser,
} from '../_shared/prompts.ts';

interface SupportingExample {
  example_or_quote: string;
  include_in_final_report: boolean;
}

interface ReportOut {
  internal_data_quality_note?: string;
  final_report_data_quality_note?: string;
  event_description: string;
  executive_summary_of_learnings: string;
  roles_or_workgroups_reviewed?: string[];
  key_event_insights: {
    insight_number: number;
    theme: string;
    title: string;
    insight: string;
    supporting_examples_or_patterns: SupportingExample[];
    system_significance: string;
  }[];
  key_learning_recommendations: {
    recommendation_number: number;
    linked_insight_number: number;
    recommended_action: string;
    risk_reduction_rationale: string;
    verification_method: string;
    is_option_to_consider: boolean;
  }[];
  limitations_and_validation_needs?: string;
  suggested_next_steps: string[];
}

// Supabase edge runtime: keeps the isolate alive for work that outlives the
// response. https://supabase.com/docs/guides/functions/background-tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
} | undefined;

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type EventRow = any;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const { event_id } = await req.json();
    if (!event_id) return json({ error: 'event_id required' }, 400);

    const db = serviceClient();

    // Ownership check.
    const { data: ev } = await db
      .from('events')
      .select('id, owner_id, title, site, occurred_at, created_at, description')
      .eq('id', event_id)
      .single();
    if (!ev) return json({ error: 'event not found' }, 404);
    const { data: prof } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (ev.owner_id !== user.id && prof?.role !== 'admin') {
      return json({ error: 'forbidden' }, 403);
    }
    // Synthesis is the expensive step — refuse it for a lapsed plan.
    await assertActivePlan(db, ev.owner_id);

    // Don't queue a second run on top of one already in flight.
    const { data: inFlight } = await db
      .from('ai_jobs')
      .select('id')
      .eq('event_id', event_id)
      .eq('type', 'insights')
      .in('status', ['queued', 'processing'])
      .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
      .limit(1);
    if (inFlight && inFlight.length > 0) {
      return json({ ok: true, job_id: inFlight[0].id, status: 'processing' }, 202);
    }

    const jobRes = await db
      .from('ai_jobs')
      .insert({ event_id, type: 'insights', status: 'processing' })
      .select('id')
      .single();
    const jobId = jobRes.data?.id;

    // Synthesis takes about a minute — far too long to hold an HTTP request
    // open, and a request that dies mid-flight used to surface as a failure to
    // the facilitator even though a retry would have worked. Queue it, answer
    // straight away, and let the app watch ai_jobs (it already polls and shows
    // an ANALYSING card). A worker killed mid-task leaves the row 'processing',
    // which the reaper in migration 0018 clears.
    const work = runInsights(db, ev, event_id, jobId);
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(work);
    } else {
      // Local/dev runtime without the background API: fall back to awaiting.
      await work;
    }

    return json({ ok: true, job_id: jobId, status: 'processing' }, 202);
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});

// The actual synthesis. Never throws to the caller — it owns the ai_jobs row
// and records its own outcome there.
async function runInsights(
  db: Db,
  ev: EventRow,
  event_id: string,
  jobId: string | undefined,
): Promise<void> {
  {
    try {
      // The facilitator is the only person who may be named in the report.
      const { data: owner } = await db
        .from('profiles')
        .select('full_name, email')
        .eq('id', ev.owner_id)
        .single();

      const { data: questions } = await db
        .from('event_questions')
        .select('id, position, text')
        .eq('event_id', event_id)
        .is('deleted_at', null);

      // Anyone removed from the roster is excluded — their answers must not
      // reach the report.
      const { data: rows } = await db
        .from('transcripts')
        .select(
          'id, text, edited_text, status, answers!inner(event_question_id, deleted_at, interviewees!inner(name, event_id, deleted_at))',
        )
        .eq('answers.interviewees.event_id', event_id)
        .is('answers.deleted_at', null)
        .is('answers.interviewees.deleted_at', null);

      const qPos = new Map<string, number>();
      (questions ?? []).forEach((q) => qPos.set(q.id, q.position));

      const grouped: Record<
        number,
        { interviewee: string; transcript_id: string; text: string }[]
      > = {};
      const people = new Set<string>();
      let unapproved = 0;
      for (const r of rows ?? []) {
        // deno-lint-ignore no-explicit-any
        const ans = (r as any).answers;
        const pos = qPos.get(ans.event_question_id);
        if (!pos) continue;
        if (r.status !== 'approved') unapproved++;
        const text = (r.edited_text ?? r.text ?? '').trim();
        if (!text) continue;
        people.add(ans.interviewees.name);
        (grouped[pos] ??= []).push({
          interviewee: ans.interviewees.name,
          transcript_id: r.id,
          text,
        });
      }

      const eventDate = ev.occurred_at ?? ev.created_at;
      const userMsg = buildInsightsUser(questions ?? [], grouped, {
        eventTitle: ev.title,
        eventDate: eventDate
          ? new Date(eventDate).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : null,
        site: ev.site,
        eventRef: `EVT-${String(event_id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
        facilitatorName: owner?.full_name?.trim() || owner?.email || null,
        description: ev.description,
        intervieweeCount: people.size,
      });

      // Admin-adjustable cap (app_settings.max_insights, 1-5).
      const { data: settings } = await db
        .from('app_settings')
        .select('max_insights')
        .single();
      const maxInsights = Math.min(Math.max(settings?.max_insights ?? 5, 1), 5);

      const out = await claudeStructured<ReportOut>({
        system: insightsSystem(maxInsights),
        user: userMsg,
        schema: insightsSchema(maxInsights),
      });

      // ---- Persist -------------------------------------------------------
      // Replace the previous report so regeneration after a correction is
      // idempotent (insights cascade-delete their recommendations).
      await db.from('insights').delete().eq('event_id', event_id);

      await db.from('event_reports').upsert(
        {
          event_id,
          event_description: out.event_description ?? '',
          executive_summary: out.executive_summary_of_learnings ?? '',
          limitations: out.limitations_and_validation_needs || null,
          next_steps: out.suggested_next_steps ?? [],
          data_quality_note: out.final_report_data_quality_note || null,
          internal_quality_note: out.internal_data_quality_note || null,
          facilitator_name: owner?.full_name?.trim() || owner?.email || null,
          interviews_reviewed: people.size,
          roles_reviewed: out.roles_or_workgroups_reviewed ?? [],
          generated_by_model: CLAUDE_MODEL,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' },
      );

      // Maximum limits are not targets — the model returns what the evidence
      // supports; we only enforce the ceiling.
      const insights = (out.key_event_insights ?? []).slice(0, maxInsights);
      const idByNumber = new Map<number, string>();

      for (let i = 0; i < insights.length; i++) {
        const ins = insights[i];
        const { data: insRow, error: insErr } = await db
          .from('insights')
          .insert({
            event_id,
            position: i + 1,
            title: ins.title,
            body: ins.insight,
            theme: ins.theme,
            system_significance: ins.system_significance,
            supporting_examples: (ins.supporting_examples_or_patterns ?? []).map(
              (e) => ({
                text: e.example_or_quote,
                include_in_report: e.include_in_final_report !== false,
              }),
            ),
            status: 'draft',
            generated_by_model: CLAUDE_MODEL,
            generated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (insErr || !insRow) continue;
        idByNumber.set(ins.insight_number, insRow.id);
      }

      // Three recommendations across the whole report, not per insight.
      const recs = (out.key_learning_recommendations ?? []).slice(0, 3);
      const fallbackInsightId = idByNumber.values().next().value as
        | string
        | undefined;
      const toInsert = recs
        .map((r, idx) => {
          const insightId =
            idByNumber.get(r.linked_insight_number) ?? fallbackInsightId;
          if (!insightId) return null;
          return {
            insight_id: insightId,
            body: r.recommended_action,
            risk_reduction_rationale: r.risk_reduction_rationale,
            verification_method: r.verification_method,
            is_option: !!r.is_option_to_consider,
            position: idx + 1,
            status: 'draft',
          };
        })
        .filter(Boolean);
      if (toInsert.length > 0) {
        await db.from('recommendations').insert(toInsert);
      }

      // First report generated → the free credit is spent. Stamped for every
      // account (subscribers included): the column means "has generated at
      // least one report", which is what the entitlement check reads.
      await db
        .from('profiles')
        .update({ free_report_used_at: new Date().toISOString() })
        .eq('id', ev.owner_id)
        .is('free_report_used_at', null);

      if (jobId) {
        await db
          .from('ai_jobs')
          .update({ status: 'done', payload: { unapproved } })
          .eq('id', jobId);
      }

      // Audio is transient on the server: the report is generated, so the
      // recordings have served their purpose. Devices keep a 7-day fallback
      // copy. Purge failure must never fail the report — the daily
      // purge_expired_audio cron mops up anything missed.
      try {
        await purgeEventAudio(db, event_id, ev.owner_id, 'auto_report');
      } catch (purgeErr) {
        console.error('post-report audio purge failed', event_id, String(purgeErr));
      }
    } catch (e) {
      if (jobId) {
        await db
          .from('ai_jobs')
          .update({ status: 'error', error: String(e) })
          .eq('id', jobId);
      }
      // Swallow: nobody is waiting on this promise, and the job row carries
      // the outcome the app reads.
      console.error('generate-insights failed', event_id, String(e));
    }
  }
}
