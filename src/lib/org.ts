// Enterprise team management — the supervisor's view of their organisation.
// Reads go straight to Supabase (RLS scopes them to the caller's org); writes
// go through Edge Functions because profiles/org_invites are not
// client-writable (migration 0021 / 0029).
import { supabase, callFunction } from './supabase';
import type { OrgRole } from './types';

export interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
  job_title: string | null;
  org_role: OrgRole;
  is_active: boolean;
  updated_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  full_name: string | null;
  expires_at: string;
  created_at: string;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('org_role', { ascending: false }) // supervisor first
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as TeamMember[];
}

export async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('org_invites')
    .select('id, email, full_name, expires_at, created_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PendingInvite[];
}

export interface InviteResult {
  ok: boolean;
  invite_id?: string;
  expires_at?: string;
  emailed?: boolean;
  skipped?: string;
  reactivated?: boolean;
}

export function inviteMember(email: string, fullName: string): Promise<InviteResult> {
  return callFunction<InviteResult>('org-invite', { email, full_name: fullName });
}

export function revokeInvite(inviteId: string): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>('org-revoke-invite', { invite_id: inviteId });
}

export function removeMember(userId: string): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>('org-remove-member', { user_id: userId });
}

// Human-readable reasons for the codes the org functions return.
export function orgErrorMessage(e: unknown): string {
  const s = String(e);
  if (/no_seats/.test(s)) return 'Every seat is taken. Free one by removing a member or an open invitation.';
  if (/already_member/.test(s)) return 'That person is already on your team.';
  if (/in_another_organisation/.test(s)) return 'That email belongs to an account in another organisation.';
  if (/cannot_invite_admin/.test(s)) return 'That account cannot be added to a team.';
  if (/subscription_inactive/.test(s)) return 'Your organisation’s subscription is not active.';
  if (/cannot_remove_supervisor/.test(s)) return 'The supervisor cannot be removed.';
  if (/FunctionsFetchError|Network request failed|fetch failed/i.test(s)) {
    return 'You are offline — team changes need a connection.';
  }
  return s.replace(/^org-[a-z-]+: /, '');
}
