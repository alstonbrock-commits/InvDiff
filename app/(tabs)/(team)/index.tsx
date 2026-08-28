import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ScreenHeader,
  Eyebrow,
  Button,
  Field,
  showDialog,
  alertDialog,
} from '@/components';
import { useAuth } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { useKeyboardHeight } from '@/lib/hooks';
import {
  fetchPendingInvites,
  fetchTeamMembers,
  inviteMember,
  orgErrorMessage,
  removeMember,
  revokeInvite,
  type TeamMember,
} from '@/lib/org';
import { initialsOf } from '@/lib/names';

// Enterprise supervisor's team: who has a seat, who has been invited, and
// the two things a supervisor can do about it — invite and remove. Seats and
// billing themselves are handled on the organisation's billing account, not
// here (nothing in the app may offer a way to buy).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function daysLeft(iso: string): string {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days <= 0) return 'expires today';
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E3DC',
        borderRadius: 12,
        padding: 13,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: 'teal' | 'orange' | 'grey' }) {
  const colors = {
    teal: { bg: 'rgba(44,165,192,0.14)', fg: '#2CA5C0' },
    orange: { bg: 'rgba(228,119,42,0.12)', fg: '#E4772A' },
    grey: { bg: '#EFEDE7', fg: '#8A9499' },
  }[tone];
  return (
    <View style={{ backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontFamily: 'Archivo-700', fontSize: 9, letterSpacing: 0.5, color: colors.fg }}>
        {label}
      </Text>
    </View>
  );
}

export default function Team() {
  const router = useRouter();
  const { session } = useAuth();
  const ent = useEntitlement();
  const keyboardHeight = useKeyboardHeight();
  const org = ent.entitlement?.org ?? null;
  const me = session?.user.id;

  const members = useQuery({ queryKey: ['team-members'], queryFn: fetchTeamMembers, retry: 1 });
  const invites = useQuery({ queryKey: ['team-invites'], queryFn: fetchPendingInvites, retry: 1 });

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshAll = async () => {
    await Promise.all([members.refetch(), invites.refetch(), ent.refresh()]);
  };

  const active = (members.data ?? []).filter((m) => m.is_active);
  // Deleted accounts keep a scrubbed profile in the org — nothing to show.
  const removed = (members.data ?? []).filter(
    (m) => !m.is_active && !m.email.endsWith('@deleted.invalid'),
  );
  const pending = invites.data ?? [];
  const seatCount = org?.seat_count ?? 0;
  const inUse = active.length + pending.length;
  const seatsLeft = Math.max(0, seatCount - inUse);
  const canInvite = EMAIL_RE.test(inviteEmail.trim()) && inviteName.trim().length > 0 && !inviting;

  const sendInvite = async () => {
    if (!canInvite) return;
    setInviting(true);
    try {
      const r = await inviteMember(inviteEmail.trim(), inviteName.trim());
      setInviteName('');
      setInviteEmail('');
      await refreshAll();
      if (r.reactivated) {
        showDialog({
          variant: 'success',
          title: 'Welcome back',
          body: 'That person was on your team before — their access is restored, and their earlier events are still here.',
        });
      } else if (r.emailed) {
        showDialog({
          variant: 'success',
          title: 'Invitation sent',
          body: `An email with a sign-up link is on its way to ${inviteEmail.trim()}. It is valid for 14 days.`,
        });
      } else {
        alertDialog(
          'Invitation saved, email not sent',
          r.skipped
            ? `The invite is recorded but the email could not be sent (${r.skipped}). Contact support if this keeps happening.`
            : 'The invite is recorded but the email could not be sent. Contact support if this keeps happening.',
        );
      }
    } catch (e) {
      alertDialog('Could not send the invitation', orgErrorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  const confirmRemove = (m: TeamMember) => {
    const name = m.full_name || m.email;
    showDialog({
      variant: 'confirm',
      title: `Remove ${name}?`,
      body: 'They will no longer be able to sign in and their seat is freed. Their events and reports stay in your feed.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Remove',
      onConfirm: () => {
        void (async () => {
          setBusyId(m.id);
          try {
            await removeMember(m.id);
            await refreshAll();
          } catch (e) {
            alertDialog('Could not remove them', orgErrorMessage(e));
          } finally {
            setBusyId(null);
          }
        })();
      },
    });
  };

  const confirmRevoke = (id: string, email: string) => {
    showDialog({
      variant: 'confirm',
      title: 'Withdraw this invitation?',
      body: `${email} will not be able to use the link, and the seat is freed.`,
      cancelLabel: 'Keep it',
      confirmLabel: 'Withdraw',
      onConfirm: () => {
        void (async () => {
          setBusyId(id);
          try {
            await revokeInvite(id);
            await refreshAll();
          } catch (e) {
            alertDialog('Could not withdraw it', orgErrorMessage(e));
          } finally {
            setBusyId(null);
          }
        })();
      },
    });
  };

  const offline = members.isError && !members.data;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Team"
        subtitle={
          org
            ? `${org.name} · ${inUse} of ${seatCount} seat${seatCount === 1 ? '' : 's'} in use`
            : 'Your organisation'
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: 16 + keyboardHeight,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl
            refreshing={members.isFetching && !members.isLoading}
            onRefresh={() => void refreshAll()}
            tintColor="#E4772A"
          />
        }
      >
        {offline && (
          <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, lineHeight: 19.5, color: '#5D6B70' }}>
            Team management is online-only — reconnect to load your team.
          </Text>
        )}

        {/* Invite */}
        <Eyebrow>Invite someone</Eyebrow>
        <Card>
          {seatsLeft > 0 ? (
            <>
              <Field
                label="Name"
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="Jordan Mercer"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!inviting}
              />
              <Field
                label="Email"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="j.mercer@yourcompany.com.au"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!inviting}
              />
              <Button variant="primary" size="sm" fullWidth disabled={!canInvite} onPress={() => void sendInvite()}>
                {inviting ? 'Sending…' : 'Send invitation'}
              </Button>
              <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11.5, lineHeight: 16, color: '#8A9499' }}>
                {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} free. They get an email with a link to set up
                their account, then sign in on the app.
              </Text>
            </>
          ) : (
            <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, lineHeight: 19, color: '#3A474D' }}>
              Every seat is in use. Remove a member or withdraw an open invitation to free one,
              or contact us to add seats.
            </Text>
          )}
        </Card>

        {/* Pending invitations */}
        {pending.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 4 }}>Invited · waiting to accept</Eyebrow>
            {pending.map((inv) => (
              <Card key={inv.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'PublicSans-600', fontSize: 14, color: '#17262D' }}>
                      {inv.full_name || inv.email}
                    </Text>
                    {!!inv.full_name && (
                      <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11.5, color: '#5D6B70', marginTop: 2 }}>
                        {inv.email}
                      </Text>
                    )}
                    <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 9.5, color: '#8A9499', marginTop: 3, textTransform: 'uppercase' }}>
                      {daysLeft(inv.expires_at)}
                    </Text>
                  </View>
                  <Tag label="INVITED" tone="orange" />
                </View>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  fullWidth
                  disabled={busyId === inv.id}
                  onPress={() => confirmRevoke(inv.id, inv.email)}
                >
                  Withdraw invitation
                </Button>
              </Card>
            ))}
          </>
        )}

        {/* Members */}
        <Eyebrow style={{ marginTop: 4 }}>Members</Eyebrow>
        {members.isLoading && (
          <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, color: '#5D6B70' }}>Loading…</Text>
        )}
        {active.map((m) => {
          const name = m.full_name || m.email;
          const isMe = m.id === me;
          return (
            <Pressable
              key={m.id}
              disabled={isMe}
              onPress={() =>
                router.push({ pathname: '/(tabs)/(team)/[memberId]', params: { memberId: m.id, name } })
              }
            >
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: m.org_role === 'supervisor' ? 'rgba(228,119,42,0.12)' : '#E7EEF0',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Archivo-800', fontSize: 12, color: m.org_role === 'supervisor' ? '#E4772A' : '#2CA5C0' }}>
                      {initialsOf(name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'PublicSans-600', fontSize: 14, color: '#17262D' }}>
                      {name}
                      {isMe ? ' (you)' : ''}
                    </Text>
                    {name !== m.email && (
                      <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11.5, color: '#5D6B70', marginTop: 2 }}>
                        {m.email}
                      </Text>
                    )}
                    {!!m.job_title && (
                      <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11, color: '#8A9499', marginTop: 2 }}>
                        {m.job_title}
                      </Text>
                    )}
                  </View>
                  {m.org_role === 'supervisor' ? (
                    <Tag label="SUPERVISOR" tone="orange" />
                  ) : (
                    <Text style={{ fontFamily: 'PublicSans-600', fontSize: 16, color: '#8A9499' }}>›</Text>
                  )}
                </View>
                {!isMe && m.org_role !== 'supervisor' && (
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    fullWidth
                    disabled={busyId === m.id}
                    onPress={() => confirmRemove(m)}
                  >
                    {busyId === m.id ? 'Removing…' : 'Remove from team'}
                  </Button>
                )}
              </Card>
            </Pressable>
          );
        })}

        {removed.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 4 }}>Removed · events kept</Eyebrow>
            {removed.map((m) => {
              const name = m.full_name || m.email;
              return (
                <Pressable
                  key={m.id}
                  onPress={() =>
                    router.push({ pathname: '/(tabs)/(team)/[memberId]', params: { memberId: m.id, name } })
                  }
                >
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'PublicSans-600', fontSize: 14, color: '#5D6B70' }}>{name}</Text>
                        <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11.5, color: '#8A9499', marginTop: 2 }}>
                          Invite this email again to restore their access.
                        </Text>
                      </View>
                      <Tag label="REMOVED" tone="grey" />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}

        <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11.5, lineHeight: 16, color: '#8A9499', marginTop: 6 }}>
          Team members only ever see their own events. Everything they log appears in your Events
          and Insights tabs, read-only.
        </Text>
      </ScrollView>
    </View>
  );
}
