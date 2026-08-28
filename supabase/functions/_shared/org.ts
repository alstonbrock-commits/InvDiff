// Organisation (enterprise seat) helpers shared by the org-* functions.
import { json } from './cors.ts';
import { requireUser, serviceClient } from './supabase.ts';

// deno-lint-ignore no-explicit-any
export type Db = any;

export interface OrgRow {
  id: string;
  name: string;
  owner_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seat_count: number;
  status: string;
  current_period_end: string | null;
  access_until: string | null;
}

export interface SupervisorContext {
  user: { id: string; email?: string };
  db: Db;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    org_id: string;
    org_role: string;
    is_active: boolean;
  };
  org: OrgRow;
}

// Caller must be the active supervisor of an organisation.
export async function requireSupervisor(req: Request): Promise<SupervisorContext> {
  const { user } = await requireUser(req);
  const db = serviceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, org_id, org_role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile?.is_active || profile.org_role !== 'supervisor' || !profile.org_id) {
    throw json({ error: 'supervisor_only' }, 403);
  }
  const { data: org } = await db
    .from('organisations')
    .select('*')
    .eq('id', profile.org_id)
    .single();
  if (!org) throw json({ error: 'organisation_not_found' }, 404);
  return { user, db, profile, org };
}

export function orgIsActive(org: OrgRow): boolean {
  return !!org.access_until && Date.parse(org.access_until) > Date.now();
}

// Seats in use = active members (the supervisor included) + invitations that
// are still open. Both count against seat_count.
export async function seatUsage(
  db: Db,
  orgId: string,
): Promise<{ used: number; pending: number }> {
  const { count: used } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true);
  const { count: pending } = await db
    .from('org_invites')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());
  return { used: used ?? 0, pending: pending ?? 0 };
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.from('audit_log').insert({ actor_id: actorId, action, entity, entity_id: entityId, detail });
}
