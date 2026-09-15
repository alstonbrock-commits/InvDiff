// The one dialog shown when a view-only account (free report already used)
// taps a locked action — recording, generating, logging a new event.
import type { useRouter } from 'expo-router';
import { showDialog } from '@/components';

type Router = ReturnType<typeof useRouter>;

export function promptSubscribe(router: Router): void {
  showDialog({
    variant: 'confirm',
    title: 'Your free report has been used',
    body: 'Your first report was on us. Subscribe to keep recording interviews and generating insight reports — everything you have already captured stays right here.',
    cancelLabel: 'Not now',
    confirmLabel: 'See the plan',
    onConfirm: () => router.push('/paywall'),
  });
}
