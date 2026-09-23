// Server-side plan gate. The device gates itself with the paywall, but the
// expensive work (transcription, synthesis) must also refuse a lapsed plan —
// a stale cached entitlement or a hand-crafted request must not spend money.
//
// Always check the EVENT OWNER's plan, not the caller's: an admin can trigger
// work on a facilitator's event, and the owner is who the seat belongs to.
import { json } from './cors.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export async function assertActivePlan(db: Db, userId: string): Promise<void> {
  const { data, error } = await db.rpc('has_active_plan_for', { p_user: userId });
  if (error) throw new Error(`entitlement check failed: ${error.message}`);
  if (!data) throw json({ error: 'subscription_required' }, 402);
}
