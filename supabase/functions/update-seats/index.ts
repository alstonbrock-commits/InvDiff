// update-seats: supervisor changes the organisation's seat count. Enforces
// the minimum and never lets seats drop below what is in use (active members
// + open invitations). Stripe prorates the difference on the next invoice.
import { handleOptions, json } from '../_shared/cors.ts';
import { audit, orgIsActive, requireSupervisor, seatUsage } from '../_shared/org.ts';
import { getStripe } from '../_shared/stripe.ts';

const MIN_SEATS = 3;
const MAX_SEATS = 500;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user, db, org } = await requireSupervisor(req);
    const { seats } = await req.json();
    const n = Number(seats);
    if (!Number.isInteger(n) || n < MIN_SEATS || n > MAX_SEATS) {
      return json({ error: `seats must be between ${MIN_SEATS} and ${MAX_SEATS}` }, 400);
    }
    if (!org.stripe_subscription_id) return json({ error: 'no_subscription' }, 409);
    if (!orgIsActive(org) || org.status === 'canceled') {
      return json({ error: 'subscription_inactive' }, 409);
    }
    const stripe = getStripe();

    const usage = await seatUsage(db, org.id);
    const inUse = usage.used + usage.pending;
    if (n < inUse) {
      return json({ error: 'seats_below_usage', in_use: inUse }, 409);
    }
    if (n === org.seat_count) return json({ ok: true, seat_count: n, unchanged: true });

    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const item = sub.items.data[0];
    if (!item) return json({ error: 'subscription has no items' }, 500);

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: n }],
      proration_behavior: 'create_prorations',
    });
    // The webhook will confirm; set it now so the portal reflects it at once.
    const { error } = await db.from('organisations').update({ seat_count: n }).eq('id', org.id);
    if (error) return json({ error: error.message }, 500);
    await audit(db, user.id, 'update_seats', 'organisation', org.id, {
      from: org.seat_count,
      to: n,
    });
    return json({ ok: true, seat_count: n });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
