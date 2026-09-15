import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { ScreenHeader, Button, Eyebrow, showDialog, alertDialog } from '@/components';
import { useEntitlement } from '@/lib/entitlement';
import {
  billingAvailable,
  fetchIndividualPackage,
  hasIndividualEntitlement,
  openManageSubscriptions,
  purchaseIndividual,
  restorePurchases,
} from '@/lib/billing';

// The subscribe screen, opened on demand (locked actions, Account tab). Not
// an interstitial: everyone gets into the app, generates one report free,
// and lands here when they want more.
//
// STORE POLICY: the only purchase path is the platform's own in-app
// purchase. No links, prices or hints about buying anywhere else.

const FEATURES = [
  'Unlimited insight reports',
  'Unlimited events and interviews',
  'Record on site, fully offline — audio uploads when you are back in range',
  'Automatic transcription with a review step before anything is used',
];

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ent = useEntitlement();

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

  // Only ever quote the store's own price — never a hard-coded one, which
  // would be wrong outside Australia.
  const price = pkg?.product.priceString ?? null;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const subscribed = ent.active && (ent.entitlement?.kind === 'individual' || ent.storeUnlocked);
  const freeAvailable = ent.entitlement?.kind === 'free';

  const buy = async () => {
    if (!pkg || busy) return;
    setBusy('buy');
    try {
      const info = await purchaseIndividual(pkg);
      if (info && hasIndividualEntitlement(info)) {
        await ent.refresh();
        showDialog({
          variant: 'success',
          title: 'Subscription active',
          body: 'Welcome aboard — reports are unlimited from here.',
          confirmLabel: 'Continue',
          onConfirm: () => router.back(),
        });
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
          body: 'Your plan is active on this device.',
          confirmLabel: 'Continue',
          onConfirm: () => router.back(),
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

  const canBuy = billingAvailable() && !!pkg && !busy && !subscribed;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="titled" title="Subscribe" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingHorizontal: 16,
          paddingBottom: 24 + insets.bottom,
          gap: 12,
        }}
      >
        <Eyebrow>One plan, everything included</Eyebrow>

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

          {/* Where this account stands */}
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: subscribed
                ? 'rgba(44,165,192,0.14)'
                : freeAvailable
                  ? 'rgba(44,165,192,0.14)'
                  : 'rgba(228,119,42,0.12)',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Text
              style={{
                fontFamily: 'PublicSans-600',
                fontSize: 12,
                color: subscribed || freeAvailable ? '#1E7F94' : '#E4772A',
              }}
            >
              {subscribed
                ? 'Your subscription is active'
                : freeAvailable
                  ? 'Your first report is free — subscribe when you need more'
                  : 'Your free report has been used'}
            </Text>
          </View>

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
            {subscribed ? (
              <Button
                variant="secondary"
                fullWidth
                onPress={() => void openManageSubscriptions().catch(() => {})}
              >
                Manage subscription
              </Button>
            ) : loadingPkg ? (
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
                {busy === 'buy' ? 'Waiting for the store…' : 'Subscribe'}
              </Button>
            )}
            {!subscribed && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                disabled={!!busy || !billingAvailable()}
                onPress={() => void restore()}
              >
                {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
              </Button>
            )}
          </View>

          {!subscribed && !loadingPkg && (!billingAvailable() || !pkg) && (
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
          Payment is charged to your {storeName} account when you confirm the purchase. The
          subscription renews automatically each month{price ? ` at ${price}` : ' at the price shown by the store'} unless
          it is cancelled at least 24 hours before the end of the current period. You can manage
          or cancel it in your {storeName} subscription settings at any time. {storeName} issues
          the receipt and tax invoice for each payment. Prices are shown in your store's currency
          and include GST where it applies.
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
      </ScrollView>
    </View>
  );
}
