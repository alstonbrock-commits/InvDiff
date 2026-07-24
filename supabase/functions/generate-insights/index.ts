// generate-insights: load all transcripts for an event, group by question,
// ask Claude for <=5 evidence-linked insights, persist insights + evidence.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { claudeStructured, CLAUDE_MODEL } from '../_shared/anthropic.ts';
import {
  INSIGHTS_SYSTEM,
  INSIGHTS_SCHEMA,
  buildInsightsUser,
} from '../_shared/prompts.ts';

interface InsightOut {
  insights: {
    title: string;
    body: string;
    evidence: { transcript_id: string; quote: string }[];
  }[];
}

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
      .select('owner_id')
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

    const jobRes = await db
      .from('ai_jobs')
      .insert({ event_id, type: 'insights', status: 'processing' })
      .select('id')
      .single();
    const jobId = jobRes.data?.id;

    // Questions.
    const { data: questions } = await db
      .from('event_questions')
      .select('id, position, text')
      .eq('event_id', event_id)
      .is('deleted_at', null);

    // Transcripts for the event, with interviewee + question position.
    const { data: rows } = await db
      .from('transcripts')
      .select(
        'id, text, edited_text, status, answers!inner(event_question_id, interviewees!inner(name, event_id))',
      )
      .eq('answers.interviewees.event_id', event_id);

    const qPos = new Map<string, number>();
    (questions ?? []).forEach((q) => qPos.set(q.id, q.position));

    const grouped: Record<
      number,
      { interviewee: string; transcript_id: string; text: string }[]
    > = {};
    let unapproved = 0;
    for (const r of rows ?? []) {
      // deno-lint-ignore no-explicit-any
      const ans = (r as any).answers;
      const pos = qPos.get(ans.event_question_id);
      if (!pos) continue;
      if (r.status !== 'approved') unapproved++;
      const text = (r.edited_text ?? r.text ?? '').trim();
      if (!text) continue;
      (grouped[pos] ??= []).push({
        interviewee: ans.interviewees.name,
        transcript_id: r.id,
        text,
      });
    }

    const userMsg = buildInsightsUser(questions ?? [], grouped);

    const out = await claudeStructured<InsightOut>({
      system: INSIGHTS_SYSTEM,
      user: userMsg,
      schema: INSIGHTS_SCHEMA,
      maxTokens: 8000,
    });

    const validTranscriptIds = new Set((rows ?? []).map((r) => r.id));

    // Replace existing draft insights for this event (facilitator can regenerate).
    await db.from('insights').delete().eq('event_id', event_id);

    const insights = out.insights.slice(0, 5);
    for (let i = 0; i < insights.length; i++) {
      const ins = insights[i];
      const { data: insRow, error: insErr } = await db
        .from('insights')
        .insert({
          event_id,
          position: i + 1,
          title: ins.title,
          body: ins.body,
          status: 'draft',
          generated_by_model: CLAUDE_MODEL,
          generated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insErr || !insRow) continue;

      const evidence = (ins.evidence ?? [])
        .filter((e) => validTranscriptIds.has(e.transcript_id))
        .map((e) => ({
          insight_id: insRow.id,
          transcript_id: e.transcript_id,
          quote: e.quote,
        }));
      if (evidence.length > 0) {
        await db.from('insight_evidence').insert(evidence);
      }
    }

    if (jobId) {
      await db
        .from('ai_jobs')
        .update({ status: 'done', payload: { unapproved } })
        .eq('id', jobId);
    }

    return json({ ok: true, count: insights.length, unapproved });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
