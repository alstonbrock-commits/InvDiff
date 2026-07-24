import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Service-role client — bypasses RLS. Only ever used inside Edge Functions,
// never shipped to the device.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// A client scoped to the caller's JWT — respects RLS. Use this to verify who
// the caller is and what they may touch.
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

export async function requireUser(req: Request) {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response('Unauthorized', { status: 401 });
  return { user: data.user, client };
}

export async function requireAdmin(req: Request) {
  const { user, client } = await requireUser(req);
  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (data?.role !== 'admin') throw new Response('Forbidden', { status: 403 });
  return { user, client };
}
