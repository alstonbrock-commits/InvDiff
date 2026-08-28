// Build the Event Insight Review PDF and share it. Rendered on-device via
// expo-print.
//
// Structure follows the client's report spec: a de-identified learning
// document. Transcripts are deliberately NOT included — no appendix, no
// interviewee names, no attributed quotes.
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { InsightWithChildren } from './remote';
import type { EventReportRow } from './types';

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface BuildArgs {
  eventTitle: string;
  eventDate?: string | null; // pre-formatted display date
  site?: string | null;
  eventRef?: string; // EVT-XXXX — rendered bottom right
  generatedAt: string;
  report: EventReportRow | null;
  insights: InsightWithChildren[];
}

function buildHtml(a: BuildArgs): string {
  const r = a.report;

  const section = (n: number, heading: string, body: string) =>
    body ? `<section><h2>${n}. ${esc(heading)}</h2>${body}</section>` : '';

  const para = (t?: string | null) =>
    t && t.trim() ? `<p>${esc(t.trim()).replace(/\n+/g, '</p><p>')}</p>` : '';

  // 3 · Key Event Insights
  const insightsHtml = a.insights
    .map((i) => {
      const examples = (i.supporting_examples ?? []).filter(
        (e) => e.include_in_report !== false && e.text?.trim(),
      );
      // Older events predate the report structure; fall back to their factors.
      const legacy = !i.theme && (i.factors?.length ?? 0) > 0;
      return `
      <div class="insight">
        <h3>${i.position}. ${esc(i.title)}</h3>
        ${i.theme ? `<p class="theme"><strong>Theme:</strong> ${esc(i.theme)}</p>` : ''}
        ${para(i.body)}
        ${
          examples.length
            ? `<p class="label">Supporting examples or patterns</p><ul>${examples
                .map((e) => `<li>${esc(e.text)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          legacy
            ? `<p class="label">Contributing factors</p><ul>${i
                .factors!.map((f) => `<li>${esc(f)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          i.system_significance
            ? `<p class="label">System significance</p>${para(i.system_significance)}`
            : ''
        }
      </div>`;
    })
    .join('');

  // 4 · Key Learning Recommendations — one table across the whole report.
  const allRecs = a.insights.flatMap((i) =>
    i.recommendations.map((rec) => ({ rec, insight: i })),
  );
  const recsHtml = allRecs.length
    ? `<table>
        <thead><tr>
          <th>Linked key insight</th>
          <th>Recommended action</th>
          <th>Risk reduction rationale</th>
          <th>Verification method</th>
        </tr></thead>
        <tbody>${allRecs
          .map(
            ({ rec, insight }) => `<tr>
              <td>${esc(insight.title)}</td>
              <td>${rec.is_option ? '<em>Option to consider — </em>' : ''}${esc(rec.body)}</td>
              <td>${esc(rec.risk_reduction_rationale ?? '—')}</td>
              <td>${esc(rec.verification_method ?? '—')}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>`
    : '';

  const nextSteps = (r?.next_steps ?? []).filter((s) => s?.trim());
  const nextStepsHtml = nextSteps.length
    ? `<ol>${nextSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';

  const qualityNote = r?.data_quality_note?.trim()
    ? `<p class="note"><strong>Data quality note:</strong> ${esc(r.data_quality_note)}</p>`
    : '';

  const metaBits = [
    r?.facilitator_name ? `Prepared by: ${esc(r.facilitator_name)}` : '',
    a.eventDate ? `Event date: ${esc(a.eventDate)}` : '',
    a.site ? `Site: ${esc(a.site)}` : '',
    `Report generated: ${esc(a.generatedAt)}`,
    r?.interviews_reviewed
      ? `Interviews reviewed: ${r.interviews_reviewed}`
      : '',
  ].filter(Boolean);

  let n = 0;
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color:#17262D; padding:34px 32px; line-height:1.55; font-size:12.5px; }
    h1 { font-size:22px; margin:0 0 6px; letter-spacing:-0.3px; }
    h2 { font-size:15px; margin:26px 0 8px; padding-bottom:5px; border-bottom:2px solid #E4772A; }
    h3 { font-size:13.5px; margin:16px 0 4px; }
    p { margin:6px 0; }
    .meta { color:#5D6B70; font-size:11px; margin-bottom:4px; }
    .theme { color:#2CA5C0; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#5D6B70; margin:10px 0 2px; }
    .insight { border-top:1px solid #E5E3DC; padding-top:6px; margin-top:14px; }
    .insight:first-child { border-top:none; }
    ul, ol { margin:4px 0 4px 18px; padding:0; }
    li { margin:3px 0; }
    table { border-collapse:collapse; width:100%; margin-top:8px; font-size:11px; }
    th { background:#F6F5F1; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.6px; color:#5D6B70; }
    th, td { border:1px solid #E5E3DC; padding:7px 8px; vertical-align:top; }
    .note { background:#FDF4EC; border:1px solid #F0D2B4; padding:8px 11px; border-radius:6px; font-size:11px; }
    .ref { text-align:right; color:#8A9499; font-size:10px; font-family:monospace; margin-top:30px; }
    .empty { color:#8A9499; font-style:italic; }
  </style></head><body>
    <h1>Event Insight Review — ${esc(a.eventTitle)}</h1>
    ${metaBits.map((m) => `<div class="meta">${m}</div>`).join('')}
    ${qualityNote}
    ${section(++n, 'Event Description', para(r?.event_description) || '<p class="empty">Not available for this review.</p>')}
    ${section(++n, 'Executive Summary of Learnings', para(r?.executive_summary) || '<p class="empty">Not available for this review.</p>')}
    ${section(++n, 'Key Event Insights', insightsHtml || '<p class="empty">No insights generated.</p>')}
    ${recsHtml ? section(++n, 'Key Learning Recommendations', recsHtml) : ''}
    ${r?.limitations?.trim() ? section(++n, 'Limitations and Validation Needs', para(r.limitations)) : ''}
    ${nextStepsHtml ? section(++n, 'Suggested Next Steps', nextStepsHtml) : ''}
    ${a.eventRef ? `<div class="ref">${esc(a.eventRef)}</div>` : ''}
  </body></html>`;
}

// Filesystem-safe version of the event name, so the shared file is called
// e.g. "Pallet fell off a truck.pdf" rather than expo-print's random id.
function safeFileName(title: string): string {
  const cleaned = (title || 'Event Insights')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return (cleaned || 'Event Insights') + '.pdf';
}

// expo-print renders in a WebView, which has been seen to never call back —
// leaving the Share button stuck on "Preparing…" with no way to retry. Fail
// loudly instead so the caller can show an error and re-enable the button.
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} took too long — please try again.`)),
      ms,
    );
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// Returns the local file uri of the generated PDF.
export async function generateAndSharePdf(a: BuildArgs): Promise<string> {
  const html = buildHtml(a);
  // Only the render is bounded; the share sheet may sit open as long as the
  // person needs it.
  const { uri } = await withTimeout(
    Print.printToFileAsync({ html }),
    45_000,
    'Building the PDF',
  );

  // Rename to the event title: the share sheet and the saved file both take
  // their name from the file, and expo-print emits a uuid.
  let shareUri = uri;
  try {
    const dir = uri.slice(0, uri.lastIndexOf('/') + 1);
    const dest = dir + encodeURIComponent(safeFileName(a.eventTitle));
    if (dest !== uri) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      await FileSystem.moveAsync({ from: uri, to: dest });
      shareUri = dest;
    }
  } catch {
    // keep the original path rather than losing the export
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: a.eventTitle,
    });
  }
  return shareUri;
}
