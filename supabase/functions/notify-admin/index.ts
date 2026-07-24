// notify-admin: emails the admin that a facilitator has logged (finalised) an
// event. Called by the app at finalise time. The in-app feed is handled
// separately by a DB trigger, so this is the email channel.
//
// Requires RESEND_API_KEY. Recipient = app_settings.admin_email.
// In Resend test mode use from = onboarding@resend.dev (only delivers to the
// Resend account owner); for production verify a domain and set NOTIFY_FROM.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    await requireUser(req); // any signed-in user (the finalising facilitator)
    const { event_id } = await req.json();
    if (!event_id) return json({ error: 'event_id required' }, 400);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFY_FROM') ?? 'Event Insight <onboarding@resend.dev>';
    if (!resendKey) return json({ ok: false, skipped: 'no RESEND_API_KEY' });

    const db = serviceClient();
    const { data: settings } = await db
      .from('app_settings')
      .select('admin_email, email_notifications')
      .single();
    const adminEmail = settings?.admin_email;
    if (settings?.email_notifications === false) return json({ ok: false, skipped: 'email notifications off' });
    if (!adminEmail) return json({ ok: false, skipped: 'no admin_email set' });

    const { data: ev } = await db
      .from('events')
      .select('title, owner_id, profiles:owner_id(full_name, email)')
      .eq('id', event_id)
      .single();
    if (!ev) return json({ error: 'event not found' }, 404);
    // deno-lint-ignore no-explicit-any
    const fac = (ev as any).profiles?.full_name || (ev as any).profiles?.email || 'A facilitator';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: adminEmail,
        subject: `Event logged: "${ev.title}"`,
        html: `<p><strong>${fac}</strong> has logged (finalised) the event <strong>"${ev.title}"</strong> in Event Insight.</p>
               <p>Open the app's Admin dashboard to review it.</p>
               <p style="color:#5C6B75;font-size:12px">— Event Insight, by Investigations Differently</p>`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ ok: false, error: `resend ${res.status}: ${detail}` }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
