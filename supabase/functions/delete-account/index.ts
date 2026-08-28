// delete-account: the in-app / web "delete my account" action (App Store
// 5.1.1(v), Google Play account-deletion policy).
//
//   Individual (no organisation): every event they own is deleted — Storage
//     objects via the Storage API (SQL cannot touch storage.objects), then the
//     rows (cascade) — and the profile is scrubbed.
//   Enterprise member: events are organisation records (Terms §5) and stay;
//     the profile is scrubbed and detached from sign-in.
//   Enterprise supervisor: refused while the organisation's subscription is
//     live (cancel it first); a lapsed organisation is closed.
//
// The auth user is deleted last. Migration 0030 dropped the profiles→auth
// cascade so the scrubbed profile can remain for the rows that reference it.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { audit } from '../_shared/org.ts';
import { getStripe } from '../_shared/stripe.ts';

const BUCKETS = ['audio', 'event-photos', 'exports'];

// deno-lint-ignore no-explicit-any
type Db = any;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== true) return json({ error: 'confirm required' }, 400);

    const db = serviceClient();
    const { data: prof } = await db
      .from('profiles')
      .select('id, email, role, org_id, org_role')
      .eq('id', user.id)
      .single();
    if (!prof) return json({ error: 'profile not found' }, 404);
    if (prof.role === 'admin') return json({ error: 'admin_cannot_self_delete' }, 403);

    // Supervisors: the organisation's money and members come first.
    if (prof.org_role === 'supervisor' && prof.org_id) {
      const { data: org } = await db
        .from('organisations')
        .select('id, status, stripe_subscription_id')
        .eq('id', prof.org_id)
        .single();
      if (org && ['trialing', 'active', 'past_due'].includes(org.status)) {
        return json({ error: 'cancel_subscription_first' }, 409);
      }
      if (org) {
        await db
          .from('organisations')
          .update({ status: 'closed', access_until: new Date().toISOString() })
          .eq('id', org.id);
      }
    }

    // Individual Stripe subscription: stop the billing. Store subscriptions
    // can only be cancelled by the user in the store (we tell them so).
    const { data: sub } = await db
      .from('subscriptions')
      .select('provider, provider_ref')
      .eq('user_id', user.id)
      .maybeSingle();
    if (sub?.provider === 'stripe' && sub.provider_ref) {
      try {
        await getStripe().subscriptions.cancel(sub.provider_ref);
      } catch (e) {
        console.error('stripe cancel failed', String(e));
      }
    }
    await db.from('subscriptions').delete().eq('user_id', user.id);

    // Individuals take their data with them.
    let eventsDeleted = 0;
    if (!prof.org_id) {
      const { data: events } = await db.from('events').select('id').eq('owner_id', user.id);
      for (const ev of events ?? []) {
        await purgeEventStorage(db, ev.id);
      }
      const { count, error: evErr } = await db
        .from('events')
        .delete({ count: 'exact' })
        .eq('owner_id', user.id);
      // Never scrub the profile while events still reference it.
      if (evErr) return json({ error: `events delete: ${evErr.message}` }, 500);
      eventsDeleted = count ?? 0;
      await db.from('admin_notifications').delete().eq('facilitator_id', user.id);
    }

    // Scrub the profile: nothing personal remains, the row stays for the
    // organisation's records (and for audit/export references).
    await db
      .from('profiles')
      .update({
        full_name: 'Deleted user',
        email: `deleted-${user.id}@deleted.invalid`,
        job_title: null,
        newsletter_opt_in: false,
        newsletter_opt_in_at: null,
        is_active: false,
        org_role: null,
        onboarded_at: null,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    await audit(db, user.id, 'delete_account', 'profile', user.id, {
      org_id: prof.org_id,
      events_deleted: eventsDeleted,
    });

    const { error: delErr } = await db.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    // RevenueCat keeps store receipts keyed by our user id; ask it to forget.
    const rcKey = Deno.env.get('RC_SECRET_API_KEY');
    if (rcKey) {
      await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rcKey}` },
      }).catch(() => {});
    }

    return json({ ok: true, events_deleted: eventsDeleted });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});

// Storage paths are <event_id>/<...>, possibly nested. Walk and remove in
// batches of 100 (the Storage API's remove limit).
async function purgeEventStorage(db: Db, eventId: string): Promise<void> {
  for (const bucket of BUCKETS) {
    const paths = await listRecursive(db, bucket, eventId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) console.error('storage remove failed', bucket, error.message);
    }
  }
}

async function listRecursive(db: Db, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error || !data) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders come back without an id; files carry one.
      if (entry.id) out.push(path);
      else out.push(...(await listRecursive(db, bucket, path)));
    }
    if (data.length < PAGE) break;
  }
  return out;
}
