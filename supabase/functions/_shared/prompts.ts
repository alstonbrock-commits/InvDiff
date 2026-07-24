// Prompts and JSON schemas for the AI pipeline.

// ---- Insights --------------------------------------------------------------
export const INSIGHTS_SYSTEM = `You are a research analyst summarising a set of field interviews.

Every interviewee was asked the SAME seven questions. The transcripts below are
grouped BY QUESTION: for each question you see all interviewees' answers together.
Your job is to find cross-cutting themes — patterns that appear ACROSS multiple
interviewees, especially within the same question.

Rules:
- Produce AT MOST 5 insights. Fewer is fine if the data does not support 5.
- Each insight MUST cite at least one piece of evidence: a verbatim quote from a
  specific transcript, with that transcript's id. Prefer evidence that spans
  multiple interviewees for the same theme.
- Quotes must be copied EXACTLY from the provided transcript text. Do not paraphrase
  inside a quote. Do not invent quotes.
- Be specific and grounded. If the interviews are thin, say so with fewer insights
  rather than padding.`;

export const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    insights: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          evidence: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                transcript_id: { type: 'string' },
                quote: { type: 'string' },
              },
              required: ['transcript_id', 'quote'],
            },
          },
        },
        required: ['title', 'body', 'evidence'],
      },
    },
  },
  required: ['insights'],
};

// Build the user message: transcripts grouped by question.
export function buildInsightsUser(
  questions: { position: number; text: string }[],
  // answers keyed by question position -> list of {interviewee, transcript_id, text}
  grouped: Record<
    number,
    { interviewee: string; transcript_id: string; text: string }[]
  >,
): string {
  const parts: string[] = [];
  for (const q of questions.sort((a, b) => a.position - b.position)) {
    parts.push(`\n=== QUESTION ${q.position}: ${q.text} ===`);
    const answers = grouped[q.position] ?? [];
    if (answers.length === 0) {
      parts.push('(no answers)');
      continue;
    }
    for (const a of answers) {
      parts.push(
        `\n[transcript_id: ${a.transcript_id}] ${a.interviewee}:\n${a.text}`,
      );
    }
  }
  return `Here are the interview transcripts, grouped by question.\n${parts.join('\n')}`;
}

// ---- Recommendations -------------------------------------------------------
export const RECS_SYSTEM = `You are advising on actions to take based on interview insights.
For each insight provided, produce 1–3 concrete, actionable recommendations that
follow directly from that insight and its evidence. Recommendations must be
specific and practical, not generic. Do not introduce new claims that the insight
does not support.`;

export const RECS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          insight_id: { type: 'string' },
          items: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
        },
        required: ['insight_id', 'items'],
      },
    },
  },
  required: ['recommendations'],
};

export function buildRecsUser(
  insights: { id: string; title: string; body: string }[],
): string {
  return (
    'Produce recommendations for each of these insights.\n\n' +
    insights
      .map((i) => `[insight_id: ${i.id}] ${i.title}\n${i.body}`)
      .join('\n\n')
  );
}
