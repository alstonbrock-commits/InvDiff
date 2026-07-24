// Build the Event Insights summary PDF (optionally with a full-transcript
// appendix) and share it. Rendered on-device via expo-print.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { InsightWithChildren, TranscriptDetail } from './remote';

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface BuildArgs {
  eventTitle: string;
  generatedAt: string;
  insights: InsightWithChildren[];
  includeTranscripts: boolean;
  transcripts: TranscriptDetail[];
  unapprovedCount: number;
}

function buildHtml(a: BuildArgs): string {
  const insightHtml = a.insights
    .map(
      (i) => `
      <section class="insight">
        <h2>${i.position}. ${esc(i.title)}</h2>
        <p>${esc(i.body)}</p>
        ${
          i.recommendations.length
            ? `<h3>Recommendations</h3><ul>${i.recommendations
                .map((r) => `<li>${esc(r.body)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          i.evidence.length
            ? `<h3>Evidence</h3>${i.evidence
                .map((e) => `<blockquote>${esc(e.quote)}</blockquote>`)
                .join('')}`
            : ''
        }
      </section>`,
    )
    .join('');

  const transcriptHtml = a.includeTranscripts
    ? `<div class="page-break"></div>
       <h1>Appendix — Full Transcripts</h1>
       ${a.transcripts
         .sort(
           (x, y) =>
             x.interviewee_name.localeCompare(y.interviewee_name) ||
             x.question_position - y.question_position,
         )
         .map(
           (t) => `
         <section class="transcript">
           <h3>${esc(t.interviewee_name)} — Q${t.question_position}: ${esc(
             t.question_text,
           )}</h3>
           <p>${esc(t.edited_text ?? t.text ?? '(no transcript)')}</p>
         </section>`,
         )
         .join('')}`
    : '';

  const warning = a.unapprovedCount
    ? `<p class="warn">⚠ ${a.unapprovedCount} transcript(s) in this event were not approved when these insights were generated.</p>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111; padding:32px; line-height:1.5; }
    h1 { font-size:24px; margin-bottom:4px; }
    h2 { font-size:18px; margin-top:24px; }
    h3 { font-size:14px; margin-top:14px; color:#334155; }
    .meta { color:#64748b; font-size:12px; margin-bottom:16px; }
    .insight { border-top:1px solid #e2e8f0; padding-top:8px; }
    blockquote { border-left:3px solid #38BDF8; margin:8px 0; padding:4px 12px; color:#334155; font-style:italic; }
    ul { margin:6px 0 6px 18px; }
    .warn { background:#FEF3C7; border:1px solid #FCD34D; padding:8px 12px; border-radius:6px; font-size:12px; }
    .page-break { page-break-before: always; }
    .transcript { border-top:1px solid #eee; padding-top:6px; margin-top:10px; }
  </style></head><body>
    <h1>Event Insights — ${esc(a.eventTitle)}</h1>
    <div class="meta">Generated ${esc(a.generatedAt)}</div>
    ${warning}
    ${insightHtml || '<p>No insights generated.</p>'}
    ${transcriptHtml}
  </body></html>`;
}

// Returns the local file uri of the generated PDF.
export async function generateAndSharePdf(a: BuildArgs): Promise<string> {
  const html = buildHtml(a);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Event Insights — ${a.eventTitle}`,
    });
  }
  return uri;
}
