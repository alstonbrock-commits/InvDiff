// Transactional email via Resend. One place for the API call, the sender
// address and the branded wrapper, shared by every function that emails.
//
// RESEND_API_KEY unset → { skipped } rather than an error, so a missing key
// in a dev project never breaks the caller's main job. NOTIFY_FROM must be a
// verified domain in production (the resend.dev default only delivers to the
// Resend account owner).

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  msg: EmailMessage,
): Promise<{ ok: boolean; skipped?: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, skipped: 'no RESEND_API_KEY' };
  const from = Deno.env.get('NOTIFY_FROM') ?? 'Event Insight <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text()}`);
  }
  return { ok: true };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Brand wrapper: navy masthead with the wordmark, paper body, mono footer.
export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#F6F5F1;font-family:'Public Sans',Helvetica,Arial,sans-serif;color:#17262D">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F5F1">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E3DC;border-radius:14px;overflow:hidden">
<tr><td style="background:#1B2B3A;padding:22px 26px">
  <div style="font-family:Archivo,Helvetica,Arial,sans-serif;font-weight:800;font-size:26px;letter-spacing:-0.5px;line-height:1">
    <span style="color:#E4772A">Event</span><span style="color:#FFFFFF">Insight</span>
  </div>
  <div style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:#7FC4D6;margin-top:8px">By Investigations Differently</div>
</td></tr>
<tr><td style="padding:26px">
  <h1 style="font-family:Archivo,Helvetica,Arial,sans-serif;font-weight:800;font-size:21px;letter-spacing:-0.4px;margin:0 0 14px;color:#17262D">${escapeHtml(title)}</h1>
  <div style="font-size:14.5px;line-height:1.55;color:#3A474D">${bodyHtml}</div>
</td></tr>
<tr><td style="padding:14px 26px 20px;border-top:1px solid #E5E3DC">
  <div style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#A8AFB2">Event Insight · Investigations Differently</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}


// --- Templates ---------------------------------------------------------------

export function welcomeIapEmail(opts: {
  name: string | null;
  store: 'apple' | 'google' | 'manual';
  trial: boolean;
}): { subject: string; html: string } {
  const storeName =
    opts.store === 'apple' ? 'Apple' : opts.store === 'google' ? 'Google Play' : 'your payment provider';
  const hello = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hi,';
  return {
    subject: 'Welcome to Event Insight',
    html: layout(
      'Welcome to Event Insight',
      `<p>${hello}</p>
       <p>Your Event Insight subscription is active.</p>
       <p>Because you subscribed through ${storeName}, ${storeName} is the merchant for this purchase and will email you the receipt and tax invoice for each payment. You can manage or cancel the subscription from your device's subscription settings.</p>
       <p>Any questions, reply to this email.</p>`,
    ),
  };
}


