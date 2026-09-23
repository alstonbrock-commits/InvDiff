import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import {
  ScreenHeader,
  ListCard,
  Button,
  Eyebrow,
  Checkbox,
  showDialog,
  alertDialog,
} from '@/components';
import { useAuth } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { openManageSubscriptions } from '@/lib/billing';
import { updateNewsletterOptIn } from '@/lib/remote';
import { callFunction } from '@/lib/supabase';
import { runSync, useSyncStatus } from '@/lib/sync/SyncProvider';

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const ROLE_LABEL: Record<string, string> = {
  facilitator: 'Investigator',
  admin: 'Administrator',
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Account() {
  const router = useRouter();
  const { profile, signOut, retryProfile } = useAuth();
  const sync = useSyncStatus();
  const ent = useEntitlement();

  const name = profile?.full_name || profile?.email || '';
  // Real job title when the account has one; role-derived label otherwise.
  const roleLabel = profile
    ? profile.job_title || (ROLE_LABEL[profile.role] ?? profile.role)
    : '';

  // Plan card rows, from the entitlement.
  const entl = ent.entitlement;
  const planRows = (() => {
    if (!entl || entl.kind === 'admin') return null;
    const rows: { label: string; value: string }[] = [];
    if (entl.kind === 'individual' && entl.individual) {
      const i = entl.individual;
      rows.push({ label: 'Plan', value: 'Event Insight subscription' });
      rows.push({
        label: 'Status',
        value:
          i.status === 'active'
            ? `Active${fmtDate(i.current_period_end) ? ` · renews ${fmtDate(i.current_period_end)}` : ''}`
            : i.status === 'canceled'
              ? `Cancelled${fmtDate(entl.access_until) ? ` · access until ${fmtDate(entl.access_until)}` : ''}`
              : i.status === 'billing_issue'
                ? 'Payment issue — check your store subscription'
                : i.status === 'manual'
                  ? 'Complimentary'
                  : i.status,
      });
      rows.push({
        label: 'Billed by',
        value: i.provider === 'apple' ? 'Apple (App Store)' : i.provider === 'google' ? 'Google Play' : '—',
      });
    } else if (entl.kind === 'free') {
      rows.push({ label: 'Plan', value: 'Free' });
      rows.push({ label: 'Status', value: 'First insight report free — not used yet' });
    } else {
      rows.push({ label: 'Plan', value: 'Free' });
      rows.push({ label: 'Status', value: 'Free report used' });
    }
    return rows;
  })();
  const storeBilled =
    entl?.kind === 'individual' &&
    (entl.individual?.provider === 'apple' || entl.individual?.provider === 'google');
  const version = Constants.expoConfig?.version ?? '1.0';

  // Optimistic so the tick responds instantly; reverts if the write fails.
  const [subscribed, setSubscribed] = useState(!!profile?.newsletter_opt_in);
  const [savingNews, setSavingNews] = useState(false);
  useEffect(() => {
    setSubscribed(!!profile?.newsletter_opt_in);
  }, [profile?.newsletter_opt_in]);

  const setNewsletter = async (next: boolean) => {
    if (savingNews || !profile) return;
    setSubscribed(next);
    setSavingNews(true);
    try {
      await updateNewsletterOptIn(profile.id, next);
      await retryProfile();
    } catch (e) {
      setSubscribed(!next);
      alertDialog('Could not save that', String(e));
    } finally {
      setSavingNews(false);
    }
  };

  // Store-mandated account deletion (App Store 5.1.1(v), Google Play). The
  // server decides what goes with it: an individual's events are deleted, an
  // enterprise member's stay with the organisation.
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await callFunction('delete-account', { confirm: true });
      await signOut();
    } catch (e) {
      const s = String(e);
      alertDialog(
        'Could not delete the account',
        /cancel_subscription_first/.test(s)
          ? "Cancel your organisation's subscription first, then delete the account."
          : /FunctionsFetchError|Network request failed|fetch failed/i.test(s)
            ? 'Deleting the account needs a connection. Try again when you are online.'
            : s,
      );
    } finally {
      setDeleting(false);
    }
  };
  const confirmDelete = () => {
    showDialog({
      variant: 'confirm',
      title: 'Delete your account?',
      body: `Your account, events, recordings, transcripts and reports are deleted permanently. This can't be undone.${storeBilled ? ' Cancel your store subscription separately — deleting the account does not stop store billing.' : ''}`,
      cancelLabel: 'Keep my account',
      confirmLabel: 'Delete',
      onConfirm: () => void deleteAccount(),
    });
  };

  // Signing out wipes this device's copy of the account (see resetLocalDb),
  // so anything still queued must reach the server first.
  const confirmSignOut = () => {
    const pending = (sync?.pendingRows ?? 0) + (sync?.pendingUploads ?? 0);
    if (pending > 0) {
      if (!sync?.online) {
        alertDialog(
          'Unsynced work on this device',
          'Connect to the internet and let the app sync before signing out, or that work will be lost.',
        );
        return;
      }
      showDialog({
        variant: 'confirm',
        title: 'Sync before signing out',
        body: `${pending} item${pending === 1 ? '' : 's'} on this device have not reached the server yet. Sync now, then try again.`,
        cancelLabel: 'Cancel',
        confirmLabel: 'Sync now',
        onConfirm: () => void runSync(),
      });
      return;
    }
    showDialog({
      variant: 'confirm',
      title: 'Sign out',
      body: 'This removes the local copy of your events from this device. Everything is synced and will be back when you sign in again.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Sign out',
      onConfirm: () =>
        void signOut().catch((e) =>
          alertDialog('Could not sign out', String(e)),
        ),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="profile"
        initials={name ? initialsOf(name) : '—'}
        title={name}
        subtitle={roleLabel}
        showWatermark
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 18,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <Eyebrow>Account information</Eyebrow>

        <ListCard
          variant="data"
          rows={[
            { label: 'Name', value: profile?.full_name || '—' },
            { label: 'Email', value: profile?.email ?? '—' },
            { label: 'Role', value: roleLabel },
          ]}
        />

        {planRows && (
          <>
            <Eyebrow style={{ marginTop: 4 }}>Subscription</Eyebrow>
            <ListCard variant="data" rows={planRows} />
            {(!ent.active || ent.entitlement?.kind === 'free') && (
              // Shown while the free report is still unused too — a day-one
              // subscriber shouldn't have to burn the free credit to find
              // the button.
              <Button variant="primary" size="sm" fullWidth onPress={() => router.push('/paywall')}>
                Subscribe — unlimited reports
              </Button>
            )}
            {storeBilled && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onPress={() => void openManageSubscriptions().catch(() => {})}
              >
                Manage subscription
              </Button>
            )}
          </>
        )}

        {/* Unsubscribe path — required for any marketing email we send. */}
        <Eyebrow style={{ marginTop: 4 }}>Email preferences</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            padding: 13,
          }}
        >
          <Checkbox
            checked={subscribed}
            disabled={savingNews}
            onChange={(next) => void setNewsletter(next)}
            label="Email me updates and insights from Investigations Differently"
            hint={
              savingNews
                ? 'Saving…'
                : subscribed
                  ? 'Untick to unsubscribe.'
                  : 'You are not subscribed.'
            }
          />
        </View>

        <View style={{ marginTop: 4 }}>
          <ListCard
            variant="nav"
            rows={[
              {
                label: 'Help & support',
                accessory: 'chevron',
                onPress: () => router.push('/help-support'),
              },
              {
                label: 'Terms of use',
                accessory: 'chevron',
                onPress: () => router.push('/terms-of-use'),
              },
              {
                label: 'Privacy policy',
                accessory: 'chevron',
                onPress: () => router.push('/privacy-policy'),
              },
              {
                label: 'Investigations Differently',
                sublabel: 'investigationsdifferently.com.au',
                accessory: 'external',
                onPress: () =>
                  WebBrowser.openBrowserAsync('https://investigationsdifferently.com.au'),
              },
            ]}
          />
        </View>

        <View style={{ marginTop: 4, gap: 10 }}>
          <Button variant="danger-ghost" size="sm" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
          <Button
            variant="danger-ghost"
            size="sm"
            fullWidth
            disabled={deleting}
            onPress={confirmDelete}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </Button>
        </View>

        <Text
          style={{
            fontFamily: 'IBMPlexMono-400',
            fontSize: 9,
            letterSpacing: 1.62,
            textTransform: 'uppercase',
            color: '#A8AFB2',
            textAlign: 'center',
            marginTop: 'auto',
            marginBottom: 14,
          }}
        >
          EventInsight v{version}
        </Text>
      </ScrollView>
    </View>
  );
}
