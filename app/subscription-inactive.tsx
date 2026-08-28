import React, { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { ScreenHeader, Button, Eyebrow, showDialog } from '@/components';
import { useAuth } from '@/lib/auth';
import { useSyncStatus } from '@/lib/sync/SyncProvider';
import { useEntitlement } from '@/lib/entitlement';
import { ROUTES, useGate } from '@/lib/gate';
import { SUPPORT_EMAIL } from '@/fixtures/legal';

// ROOT-level interstitial for enterprise accounts whose organisation has no
// active subscription, and for members a supervisor has deactivated. There
// is deliberately no purchase or billing link here (store policy) — the
// organisation's billing is handled outside the app.

export default function SubscriptionInactive() {
  const insets = useSafeAreaInsets();
  const gate = useGate();
  const { profile, signOut } = useAuth();
  const ent = useEntitlement();
  const sync = useSyncStatus();
  const [checking, setChecking] = useState(false);

  if (gate.target && gate.target !== ROUTES.inactive) return <Redirect href="/" />;

  const org = ent.entitlement?.org ?? null;
  const deactivated = profile ? !profile.is_active : false;
  const supervisor = profile?.org_role === 'supervisor';

  let title: string;
  let body: string;
  if (deactivated && !profile?.org_id) {
    title = 'Account deactivated';
    body = `This account has been deactivated. If you think this is a mistake, contact us at ${SUPPORT_EMAIL}.`;
  } else if (deactivated) {
    title = 'Account deactivated';
    body =
      'Your organisation has removed your access to Event Insight. If you think this is a mistake, contact your supervisor' +
      (org?.supervisor_name ? `, ${org.supervisor_name}.` : '.');
  } else if (supervisor) {
    title = 'Subscription inactive';
    body =
      `${org?.name ?? 'Your organisation'}'s Event Insight subscription is not active` +
      (org?.status === 'pending'
        ? ' yet — the set-up has not been completed.'
        : org?.status === 'past_due'
          ? ' because the last payment did not go through.'
          : '.') +
      ` Contact us at ${SUPPORT_EMAIL} and we will help you restore access for your team.`;
  } else {
    title = 'Subscription inactive';
    body =
      `${org?.name ?? 'Your organisation'}'s Event Insight subscription is not active right now. ` +
      `Contact your supervisor${org?.supervisor_name ? `, ${org.supervisor_name},` : ''} to restore access.`;
  }

  const check = async () => {
    setChecking(true);
    await ent.refresh();
    setChecking(false);
  };

  const pendingWork = (sync?.pendingRows ?? 0) + (sync?.pendingUploads ?? 0);
  const confirmSignOut = () =>
    showDialog({
      variant: 'confirm',
      title: 'Sign out',
      body:
        pendingWork > 0
          ? `${pendingWork} item${pendingWork === 1 ? '' : 's'} recorded on this device have not reached the server yet and will be deleted if you sign out now.`
          : 'You can sign back in any time.',
      cancelLabel: 'Cancel',
      confirmLabel: pendingWork > 0 ? 'Sign out and delete' : 'Sign out',
      onConfirm: () => void signOut(),
    });

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="brand" showWatermark />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingHorizontal: 16,
          paddingBottom: 24 + insets.bottom,
          gap: 12,
        }}
      >
        <Eyebrow>{org?.name ?? 'Enterprise account'}</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 14,
            padding: 18,
            gap: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: 22,
              letterSpacing: -0.44,
              color: '#17262D',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13.5,
              lineHeight: 20,
              color: '#3A474D',
            }}
          >
            {body}
          </Text>
          {!deactivated && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12,
                lineHeight: 17,
                color: '#8A9499',
              }}
            >
              Your events and reports are safe and will be there as soon as the
              subscription is active again.
            </Text>
          )}
          {!deactivated && (
            <View style={{ marginTop: 4 }}>
              <Button variant="secondary" size="sm" fullWidth disabled={checking} onPress={() => void check()}>
                {checking ? 'Checking…' : 'Check again'}
              </Button>
            </View>
          )}
        </View>

        <View style={{ marginTop: 6 }}>
          <Button variant="danger-ghost" size="sm" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
