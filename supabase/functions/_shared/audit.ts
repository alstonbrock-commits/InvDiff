// Shared audit_log writer for Edge Functions (service role).

// deno-lint-ignore no-explicit-any
type Db = any;

export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db
    .from('audit_log')
    .insert({ actor_id: actorId, action, entity, entity_id: entityId, detail });
}
