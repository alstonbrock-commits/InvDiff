// Remove an event's audio: Storage objects via the API (SQL cannot delete
// from storage.objects — Supabase rejects it), then the purge_event_audio RPC
// stamps the answer rows (audio_purged_at, purge_source, audio_path = null)
// and writes the audit entry.
// deno-lint-ignore no-explicit-any
type Db = any;

export async function purgeEventAudio(
  db: Db,
  eventId: string,
  actorId: string,
  source: 'manual' | 'auto_report',
): Promise<number> {
  const { data: answers, error: selErr } = await db
    .from('answers')
    .select('audio_path, interviewees!inner(event_id)')
    .eq('interviewees.event_id', eventId)
    .not('audio_path', 'is', null);
  if (selErr) throw new Error(`purge select: ${selErr.message}`);

  const paths = (answers ?? [])
    // deno-lint-ignore no-explicit-any
    .map((a: any) => a.audio_path)
    .filter((p: unknown): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await db.storage.from('audio').remove(paths);
    if (rmErr) throw new Error(`storage remove: ${rmErr.message}`);
  }

  const { data: n, error } = await db.rpc('purge_event_audio', {
    p_event_id: eventId,
    p_actor: actorId,
    p_source: source,
  });
  // Surface RPC failures — the objects are already gone at this point, so a
  // silent failure would leave rows claiming audio that no longer exists.
  if (error) throw new Error(`purge_event_audio rpc: ${error.message}`);
  return (n as number | null) ?? paths.length;
}
