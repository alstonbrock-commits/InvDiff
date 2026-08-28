// create-billing-portal-session: a Stripe Customer Portal link for the
// caller — payment method, invoice history, cancellation. Seat changes are
// deliberately NOT enabled in the portal configuration; they go through
// update-seats so the minimum and the seats-in-use floor are enforced.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { customerIdOf, getStripe, PORTAL_URL } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const db = serviceClient();
    const { data: prof } = await db
      .from('profiles')
      .select('id, email, full_name, org_id, org_role, is_active')
      .eq('id', user.id)
      .single();
    if (!prof?.is_active) return json({ error: 'forbidden' }, 403);

    const stripe = getStripe();
    let customer: string | null = null;
    if (prof.org_id) {
      if (prof.org_role !== 'supervisor') return json({ error: 'supervisor_only' }, 403);
      const { data: org } = await db
        .from('organisations')
        .select('stripe_customer_id')
        .eq('id', prof.org_id)
        .single();
      customer = org?.stripe_customer_id ?? null;
    } else {
      // The customer is whoever owns the subscription we track — Stripe's
      // Search index lags, so never go looking by metadata here.
      const { data: sub } = await db
        .from('subscriptions')
        .select('provider, provider_ref')
        .eq('user_id', user.id)
        .maybeSingle();
      if (sub?.provider !== 'stripe' || !sub.provider_ref) {
        return json({ error: 'not_billed_by_stripe' }, 409);
      }
      const s = await stripe.subscriptions.retrieve(sub.provider_ref);
      customer = customerIdOf(s.customer);
    }
    if (!customer) return json({ error: 'no_billing_account' }, 409);

    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${PORTAL_URL}/billing`,
    });
    return json({ url: session.url });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
