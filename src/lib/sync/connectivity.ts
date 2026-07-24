import NetInfo from '@react-native-community/netinfo';

let online = true;
const listeners = new Set<(online: boolean) => void>();

NetInfo.addEventListener((state) => {
  const next = !!state.isConnected && state.isInternetReachable !== false;
  if (next !== online) {
    online = next;
    listeners.forEach((cb) => cb(online));
  }
});

export function isOnline(): boolean {
  return online;
}

export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function refreshConnectivity(): Promise<boolean> {
  const state = await NetInfo.fetch();
  online = !!state.isConnected && state.isInternetReachable !== false;
  return online;
}
