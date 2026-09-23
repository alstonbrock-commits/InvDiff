// In-app purchases for the Individual plan, through RevenueCat. RevenueCat
// fronts Apple IAP and Google Play Billing with one SDK and posts every
// subscription change to the revenuecat-webhook Edge Function, which writes
// the `subscriptions` row the server-side entitlement check reads.
//
// The RevenueCat app user id is the Supabase user id, so a webhook event maps
// straight onto a profile. Keys are the PUBLIC SDK keys (safe in the bundle).
//
// Every call here is defensive: with no key configured (local dev without a
// RevenueCat project) the app still runs — the paywall just cannot purchase.
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';
import { RC_ANDROID_KEY, RC_IOS_KEY } from './config';

/** RevenueCat entitlement identifier that unlocks the Individual plan. */
export const ENTITLEMENT_ID = 'individual';

const API_KEY = Platform.select({ ios: RC_IOS_KEY, android: RC_ANDROID_KEY }) ?? '';

let configured = false;
let currentUser: string | null = null;

export function billingAvailable(): boolean {
  return API_KEY.length > 0;
}

// Configure once per process, then switch identities with logIn — the SDK
// does not support re-configuring for a different user.
export async function configureBilling(userId: string): Promise<boolean> {
  if (!billingAvailable()) return false;
  try {
    if (!configured) {
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configured = true;
    } else if (currentUser !== userId) {
      await Purchases.logIn(userId);
    }
    currentUser = userId;
    return true;
  } catch {
    return false;
  }
}

export async function logOutBilling(): Promise<void> {
  if (!configured || !currentUser) return;
  currentUser = null;
  await Purchases.logOut().catch(() => {});
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  return Purchases.getCustomerInfo().catch(() => null);
}

export function hasIndividualEntitlement(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[ENTITLEMENT_ID];
}

/** The monthly Individual package from the current offering, if any. */
export async function fetchIndividualPackage(): Promise<PurchasesPackage | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    return current.monthly ?? current.availablePackages[0] ?? null;
  } catch {
    return null;
  }
}

/** Returns the customer info after a completed purchase, or null if the user backed out. */
export async function purchaseIndividual(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return null;
    throw e;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/** Opens the store's subscription management page (App Store / Google Play). */
export async function openManageSubscriptions(): Promise<void> {
  if (!configured) return;
  await Purchases.showManageSubscriptions();
}

export function subscribeCustomerInfo(cb: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(cb);
  };
}

// Intro-offer copy for the paywall, e.g. "7-day free trial". iOS exposes the
// introductory price on the product; Android exposes it as the free phase of
// a subscription option. Returns null when the store reports no free trial
// (e.g. the account already used one) so the paywall does not over-promise.
export function describeFreeTrial(product: PurchasesStoreProduct): string | null {
  const intro = product.introPrice;
  if (intro && intro.price === 0) {
    return `${periodLabel(intro.periodNumberOfUnits, intro.periodUnit)} free trial`;
  }
  const free = product.subscriptionOptions?.find((o) => o.freePhase)?.freePhase;
  if (free) {
    const p = free.billingPeriod;
    return `${periodLabel(p.value, p.unit)} free trial`;
  }
  return null;
}

function periodLabel(n: number, unit: string): string {
  const u = unit.toUpperCase();
  const word = u.startsWith('DAY')
    ? 'day'
    : u.startsWith('WEEK')
      ? 'week'
      : u.startsWith('MONTH')
        ? 'month'
        : 'year';
  if (word === 'week' && n === 1) return '7-day';
  return `${n}-${word}`;
}
