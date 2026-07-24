import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSyncStatus, runSync } from '@/lib/sync/SyncProvider';
import { colors, spacing } from '@/lib/theme';
import { Pressable } from 'react-native';

// Compact status strip shown at the top of the main screens so a facilitator
// in the field always knows whether their work is safe on the server.
export function SyncBanner() {
  const s = useSyncStatus();
  if (!s) return null;

  const pending = s.pendingRows + s.pendingUploads;
  let text: string;
  let bg = colors.surfaceAlt;

  if (!s.online) {
    text = `Offline — ${pending} item(s) waiting to sync`;
    bg = '#422006';
  } else if (s.running) {
    text = 'Syncing…';
  } else if (pending > 0) {
    text = `${pending} item(s) queued`;
  } else {
    text = 'All changes synced';
    bg = '#052E16';
  }

  return (
    <Pressable onPress={() => runSync()}>
      <View style={[styles.banner, { backgroundColor: bg }]}>
        <Text style={styles.text}>{text}</Text>
        {s.pendingUploads > 0 ? (
          <Text style={styles.sub}>{s.pendingUploads} recording(s) uploading</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
    borderRadius: 8,
    marginBottom: spacing(2),
  },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
