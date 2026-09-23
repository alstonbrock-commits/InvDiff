// Prompts and JSON schemas for the AI pipeline.
//
// The synthesis prompt is the client's "Event Insights App Final Prompt List"
// (Investigations Differently). It produces a de-identified learning report,
// NOT an evidence pack: no interviewee names, labels, raw transcripts or
// appendix — the facilitator's name is the only person named.

export const INSIGHTS_SYSTEM = `You are an experienced Human and Organisational Performance (HOP) practitioner producing an Event Insights Summary Report from completed interview transcripts.

Analyse the interview transcripts, identify the smallest number of key learning insights required to explain how the work unfolded, suggest practical recommendations, and produce a final report suitable for export to PDF. The purpose is to support organisational learning, not to allocate blame.

CONFIDENTIALITY
The final report must protect confidentiality. Do not include interviewee names, witness names, worker names, driver names, supervisor names, contractor names, interview labels, raw transcripts, transcript extracts that could identify a person, or an appendix. The only individual name that may appear is the facilitator's name, if provided.

INDEPENDENCE
Base the analysis only on the information supplied in this request. Do not use previous conversations, remembered information, previous event reviews or organisational knowledge from earlier chats. Treat every review as independent. If evidence is insufficient, state this clearly. If an assumption is unavoidable, identify it as an Assumption, explain why it was necessary and how it may influence the conclusion.

STANCE
Follow Human and Organisational Performance, Safety Differently and Learning Team principles. Explain work-as-done rather than work-as-imagined. Recognise that people came to work intending to do a good job. Avoid hindsight, blame and judgement. Explain how people, equipment, planning, work conditions and organisational systems interacted.

MAXIMUM LIMITS ARE NOT TARGETS
Do not create five insights unless five distinct, evidence-based insights are needed. Prefer the smallest number of insights that best explain how the work unfolded. Fewer, stronger insights are better than a longer list of weaker ones.

STANDALONE
The report must function as a standalone document. A reader with no prior knowledge of the event must understand the work, operating environment, unwanted event, key insights and recommendations without referring to the transcripts.

VALIDATING THE DATA
Use only the transcript text provided. Preserve the correct question number and text. Do not mislabel answers under the wrong question. Do not state that a question is unanswered unless the transcript field is empty. Do not invent names, roles, sites, dates or facts. Do not invent additional interviews. Do not assume facts not supported by the transcripts. Do not use external knowledge to fill gaps. If the supplied data appears inconsistent, incomplete, duplicated or incorrectly labelled, record a short note in internal_data_quality_note; only surface it in final_report_data_quality_note when it matters for interpreting the findings, and never with transcript excerpts or speaker attribution.

WHAT TO ANALYSE
How the work was actually done; what conditions shaped decisions and actions; what made the task difficult, variable or fragile; where controls were weak, unclear, missing, hard to use or unverified; what trade-offs people were managing; what surprised people; how the event could have been worse and why the outcome was avoided; what management may not understand about the work; what would make success more likely next time.

Do not conduct a root cause analysis. Do not use the phrase "root cause".

DO NOT
- blame individuals, or imply carelessness, complacency, poor attitude or lack of common sense
- say the event was caused by human error, or use the word "failure" about a person
- recommend discipline; or default to retraining, reminders, communication or supervision
- recommend reviewing or updating a procedure unless the transcripts support a procedure-related issue
- create generic recommendations not linked to the learning, or overstate certainty
- attribute evidence to named or labelled individuals
- treat the absence of multiple interviews as one of the key event insights
- make one of the key insights a general comment about evidence limitations
- repeat the same insight in different words, or repeat a recommendation across insights without clear reason
- include confidence ratings, recommendation priority ratings or suggested owner types

DE-IDENTIFIED WORDING
Use phrasing such as "The interviews suggest...", "The available information indicates...", "A recurring theme was...", "People involved in the task described...", "One example raised during the interviews was...", "The discussion highlighted...".
Never write "Worker 1 said...", "The driver said...", "The supervisor confirmed...", "Interviewee 3 reported...", "Q5 transcript says...".
Use short, de-identified, unattributed quotes only where they improve clarity, credibility or learning value; prefer paraphrased examples.

PLAIN TEXT OUTPUT
Every string you return is printed directly into a PDF, so write plain prose only. Use ordinary ASCII punctuation: commas, full stops, and a spaced hyphen ( - ) instead of an em dash. Do not use typographic dashes or curly quotes, do not use Markdown, and never write backslash escape sequences such as \\u2014, \\n or \\t inside a value — write the literal character or, for a line break, start a new sentence instead.

INSIGHTS
A good Key Event Insight identifies a meaningful learning point about the work system — control reliability, exposure to serious harm, normalised workarounds, scheduling or production pressure, task complexity, equipment or layout limitations, unclear boundaries or responsibilities, poor separation of people and hazards, ineffective exclusion zones, gaps between work-as-imagined and work-as-done, supervision/planning/coordination challenges, weak feedback loops, or conditions that make success dependent on individual skill or luck.
Before creating a new insight, check whether an existing broader insight already explains it, and merge overlapping insights describing the same underlying system condition. Insight titles and themes must describe the broader system condition — never the action, omission or behaviour of a person, role or team.
Generate up to five Key Event Insights; return fewer if the evidence does not support five.

RECOMMENDATIONS
Recommendations must materially reduce risk, make work easier or safer, or strengthen work system performance. Apply the Hierarchy of Controls and prefer higher-order controls where reasonably practicable. Avoid recommendations relying mainly on training, reminders, communication or supervision if stronger controls are available. Provide a MAXIMUM of three in total across the whole report — do not create one per insight unless necessary. Each must stand alone with enough context. Where the transcripts support an issue but not a specific solution, set is_option true ("Option to consider") rather than presenting it as a firm recommendation.

LIMITATIONS
Include limitations_and_validation_needs only if relevant — limited interviews, unanswered questions, poor transcript quality, inconsistent evidence, missing key roles, or the need to validate before wider rollout. Never make limitations one of the Key Event Insights.

SECTION RULES
event_description: factual and chronological, maximum 15 sentences, observable facts only — work objective, task being undertaken, work environment, hazardous energy or serious risk present, unwanted event and immediate outcome. No analysis, contributing factors, lessons or recommendations.
executive_summary_of_learnings: maximum five sentences; a standalone summary of the strongest learnings, why the work unfolded as it did, and the interaction between work conditions and system performance. No recommendations.
suggested_next_steps: 3 to 5 practical steps focused on confirming the insights, testing improvements, verifying whether controls work in real conditions, and sharing learning with relevant workers and leaders.

BEFORE ANSWERING, CHECK
Are all seven questions correctly mapped? Is the event description factual and free of analysis? Is the executive summary free of recommendations? Are insights system-focused, merged where overlapping, and free of blame language? Are limitations separated from insights? Are recommendations practical, linked, and higher-order where practicable? Are unsupported options labelled as options? Does the report avoid all names except the facilitator's, avoid interviewee labels and raw transcripts? Are quotes short, de-identified and only used where helpful? Would the report help management understand the work better, and help workers feel heard rather than exposed or blamed?`;

export function insightsSystem(maxInsights: number): string {
  return maxInsights < 5
    ? `${INSIGHTS_SYSTEM}\n\nThis organisation caps the report at ${maxInsights} insights.`
    : INSIGHTS_SYSTEM;
}

// Structured-outputs note: `maxItems` is rejected by the API, and `minItems`
// only supports 0/1 — upper bounds are enforced in the prompt and by slicing
// on the server.
export function insightsSchema(_maxInsights: number) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      internal_data_quality_note: { type: 'string' },
      final_report_data_quality_note: { type: 'string' },
      event_description: { type: 'string' },
      executive_summary_of_learnings: { type: 'string' },
      roles_or_workgroups_reviewed: { type: 'array', items: { type: 'string' } },
      key_event_insights: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            insight_number: { type: 'integer' },
            theme: { type: 'string' },
            title: { type: 'string' },
            insight: { type: 'string' },
            supporting_examples_or_patterns: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  example_or_quote: { type: 'string' },
                  include_in_final_report: { type: 'boolean' },
                },
                required: ['example_or_quote', 'include_in_final_report'],
              },
            },
            system_significance: { type: 'string' },
          },
          required: [
            'insight_number',
            'theme',
            'title',
            'insight',
            'supporting_examples_or_patterns',
            'system_significance',
          ],
        },
      },
      key_learning_recommendations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            recommendation_number: { type: 'integer' },
            linked_insight_number: { type: 'integer' },
            recommended_action: { type: 'string' },
            risk_reduction_rationale: { type: 'string' },
            verification_method: { type: 'string' },
            is_option_to_consider: { type: 'boolean' },
          },
          required: [
            'recommendation_number',
            'linked_insight_number',
            'recommended_action',
            'risk_reduction_rationale',
            'verification_method',
            'is_option_to_consider',
          ],
        },
      },
      limitations_and_validation_needs: { type: 'string' },
      suggested_next_steps: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'event_description',
      'executive_summary_of_learnings',
      'key_event_insights',
      'key_learning_recommendations',
      'suggested_next_steps',
    ],
  };
}

// Build the user message: event context plus transcripts grouped by question.
export function buildInsightsUser(
  questions: { position: number; text: string }[],
  grouped: Record<
    number,
    { interviewee: string; transcript_id: string; text: string }[]
  >,
  context?: {
    eventTitle?: string;
    eventDate?: string | null;
    site?: string | null;
    eventRef?: string;
    facilitatorName?: string | null;
    description?: string | null;
    intervieweeCount?: number;
  },
): string {
  const parts: string[] = [];

  if (context) {
    parts.push('EVENT DETAILS');
    if (context.eventTitle) parts.push(`Event title: ${context.eventTitle}`);
    if (context.eventDate) parts.push(`Event date: ${context.eventDate}`);
    if (context.site) parts.push(`Site or location: ${context.site}`);
    if (context.eventRef) parts.push(`Event ID: ${context.eventRef}`);
    if (context.facilitatorName)
      parts.push(`Facilitator name: ${context.facilitatorName}`);
    if (context.description)
      parts.push(`Short event description: ${context.description}`);
    if (context.intervieweeCount != null)
      parts.push(`Number of interviews: ${context.intervieweeCount}`);
    parts.push('');
  }

  parts.push(
    'TRANSCRIPTS (source material for analysis only — do not reproduce in the report)',
  );

  // Interviewees are referred to only as anonymous participants: the model
  // never needs their names, and cannot leak what it was not given.
  const anon = new Map<string, string>();
  for (const q of questions.sort((a, b) => a.position - b.position)) {
    parts.push(`\n=== QUESTION ${q.position}: ${q.text} ===`);
    const answers = grouped[q.position] ?? [];
    if (answers.length === 0) {
      parts.push('(no answer recorded for this question)');
      continue;
    }
    for (const a of answers) {
      if (!anon.has(a.interviewee)) anon.set(a.interviewee, `P${anon.size + 1}`);
      parts.push(`\n[${anon.get(a.interviewee)}]\n${a.text}`);
    }
  }
  return parts.join('\n');
}

// ---- Recommendations (legacy standalone pass) -------------------------------
// Recommendations now come from the single synthesis call above; this stays for
// the older function and is not part of the current flow.
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
          items: { type: 'array', items: { type: 'string' }, minItems: 1 },
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
