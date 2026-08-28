import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { ScreenHeader, Button, Eyebrow, showDialog, alertDialog } from '@/components';
import { useAuth } from '@/lib/auth';
import { useSyncStatus } from '@/lib/sync/SyncProvider';
import { useEntitlement } from '@/lib/entitlement';
import { ROUTES, useGate } from '@/lib/gate';
import {
  billingAvailable,
  describeFreeTrial,
  fetchIndividualPackage,
  hasIndividualEntitlement,
  purchaseIndividual,
  restorePurchases,
} from '@/lib/billing';

// ROOT-level interstitial: shown to a signed-in individual account with no
// active plan. Lives outside (auth) because a session exists, and outside
// (tabs) because the app is not usable yet.
//
// STORE POLICY: the only purchase path offered here is the platform's own
// in-app purchase. No links, prices or hints about buying anywhere else —
// enterprise seats are provisioned outside the app and are mentioned only as
// "ask your supervisor for an invite".

const FEATURES = [
  'Unlimited events and interviews',
  'Record on site, fully offline — audio uploads when you are back in range',
  'Automatic transcription with a review step before anything is used',
  'AI-written, de-identified insight reports with a shareable PDF',
];

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gate = useGate();
  const { signOut } = useAuth();
  const ent = useEntitlement();
  const sync = useSyncStatus();
  const [checking, setChecking] = useState(false);

  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loadingPkg, setLoadingPkg] = useState(true);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const loadPackage = useCallback(async () => {
    setLoadingPkg(true);
    setPkg(await fetchIndividualPackage());
    setLoadingPkg(false);
  }, []);

  useEffect(() => {
    void loadPackage();
  }, [loadPackage]);

  // Purchased / restored / plan arrived from elsewhere → the gate moves on.
  if (gate.target && gate.target !== ROUTES.paywall) return <Redirect href="/" />;

  // Only ever quote the store's own price — never a hard-coded one, which
  // would be wrong outside Australia.
  const price = pkg?.product.priceString ?? null;
  const trial = pkg ? describeFreeTrial(pkg.product) : null;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  const buy = async () => {
    if (!pkg || busy) return;
    setBusy('buy');
    try {
      const info = await purchaseIndividual(pkg);
      if (info && hasIndividualEntitlement(info)) {
        await ent.refresh();
      }
    } catch (e) {
      alertDialog('Purchase did not complete', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const info = await restorePurchases();
      if (hasIndividualEntitlement(info)) {
        await ent.refresh();
        showDialog({
          variant: 'success',
          title: 'Subscription restored',
          body: 'Your Individual plan is active on this device.',
          confirmLabel: 'Continue',
        });
      } else {
        alertDialog(
          'Nothing to restore',
          `No active Event Insight subscription was found for your ${storeName} account.`,
        );
      }
    } catch (e) {
      alertDialog('Could not restore', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Signing out wipes the device. A field worker whose plan lapsed with
  // recordings still queued must know they are about to lose them.
  const pendingWork = (sync?.pendingRows ?? 0) + (sync?.pendingUploads ?? 0);
  const confirmSignOut = () =>
    showDialog({
      variant: 'confirm',
      title: 'Sign out',
      body:
        pendingWork > 0
          ? `${pendingWork} item${pendingWork === 1 ? '' : 's'} recorded on this device have not reached the server yet and will be deleted. Subscribe first to sync them, or sign out and lose them.`
          : 'You can sign back in any time.',
      cancelLabel: 'Cancel',
      confirmLabel: pendingWork > 0 ? 'Sign out and delete' : 'Sign out',
      onConfirm: () => void signOut(),
    });

  const checkAgain = async () => {
    setChecking(true);
    await ent.refresh();
    setChecking(false);
  };

  const canBuy = billingAvailable() && !!pkg && !busy;

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
        <Eyebrow>Choose your plan</Eyebrow>

        {/* Plan card */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 14,
            padding: 18,
            gap: 12,
          }}
        >
          <View>
            <Text
              style={{
                fontFamily: 'Archivo-800',
                fontSize: 22,
                letterSpacing: -0.44,
                color: '#17262D',
              }}
            >
              Individual
            </Text>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 18,
                color: '#5D6B70',
                marginTop: 2,
              }}
            >
              For one investigator running their own events.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text
              style={{
                fontFamily: 'Archivo-800',
                fontSize: price ? 30 : 16,
                letterSpacing: -0.6,
                color: '#E4772A',
              }}
            >
              {price ?? 'Price shown by the store'}
            </Text>
            {price && (
              <Text style={{ fontFamily: 'PublicSans-500', fontSize: 13, color: '#5D6B70' }}>
                per month, incl. GST
              </Text>
            )}
          </View>

          {trial && (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(44,165,192,0.14)',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#1E7F94' }}>
                {trial}{price ? ` — then ${price}/month` : ''}
              </Text>
            </View>
          )}

          <View style={{ gap: 7, marginTop: 2 }}>
            {FEATURES.map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#2CA5C0',
                    marginTop: 7,
                  }}
                />
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 13,
                    lineHeight: 19,
                    color: '#3A474D',
                    flex: 1,
                  }}
                >
                  {f}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 6, gap: 8 }}>
            {loadingPkg ? (
              <View
                style={{
                  backgroundColor: '#E4772A',
                  borderRadius: 12,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: 0.8,
                }}
              >
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : (
              <Button variant="primary" fullWidth disabled={!canBuy} onPress={() => void buy()}>
                {busy === 'buy'
                  ? 'Waiting for the store…'
                  : trial
                    ? 'Start free trial'
                    : 'Subscribe'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              disabled={!!busy || !billingAvailable()}
              onPress={() => void restore()}
            >
              {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
            </Button>
          </View>

          {!loadingPkg && (!billingAvailable() || !pkg) && (
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 12,
                  lineHeight: 17,
                  color: '#8A9499',
                }}
              >
                {billingAvailable()
                  ? `The ${storeName} did not return the plan. Check your connection and try again.`
                  : 'In-app purchases are not configured for this build.'}
              </Text>
              {billingAvailable() && (
                <Pressable onPress={() => void loadPackage()} hitSlop={8}>
                  <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
                    Try again
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Team members never buy here — their seat comes from an invite. */}
        <View
          style={{
            backgroundColor: '#EFEDE7',
            borderRadius: 12,
            padding: 13,
          }}
        >
          <Text
            style={{
              fontFamily: 'PublicSans-600',
              fontSize: 13,
              color: '#17262D',
            }}
          >
            Part of a team?
          </Text>
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 12.5,
              lineHeight: 18,
              color: '#5D6B70',
              marginTop: 3,
            }}
          >
            Ask your supervisor for an invite. You will receive an email with a link, and
            your seat is ready as soon as you accept it — nothing to buy here.
          </Text>
        </View>

        {/* Mandatory subscription disclosures */}
        <Text
          style={{
            fontFamily: 'PublicSans-400',
            fontSize: 11,
            lineHeight: 16,
            color: '#8A9499',
            marginTop: 4,
          }}
        >
          Payment is charged to your {storeName} account when you confirm the purchase
          {trial ? ', after the free trial ends' : ''}. The subscription renews automatically
          each month{price ? ` at ${price}` : ' at the price shown by the store'} unless it is
          cancelled at least 24 hours before the end of the current period. You can manage or cancel it in your {storeName} subscription
          settings at any time. Prices are shown in your store's currency and include GST
          where it applies.
        </Text>

        <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 2 }}>
          <Pressable onPress={() => router.push('/terms-of-use')} hitSlop={8}>
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
              Terms of use
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/privacy-policy')} hitSlop={8}>
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
              Privacy policy
            </Text>
          </Pressable>
        </View>

        {/* A plan bought elsewhere (web) or a slow first read: re-ask the server. */}
        <View style={{ marginTop: 6 }}>
          <Button variant="secondary" size="sm" fullWidth disabled={checking} onPress={() => void checkAgain()}>
            {checking ? 'Checking…' : 'Already subscribed? Check again'}
          </Button>
        </View>
        <View style={{ marginTop: 4 }}>
          <Button variant="danger-ghost" size="sm" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
