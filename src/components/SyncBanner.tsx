import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncStatus, runSync } from '@/lib/sync/SyncProvider';
import { colors, radius, spacing } from '@/lib/theme';

// Compact status strip so a facilitator in the field always knows whether their
// work is safe on the server.
export function SyncBanner() {
  const s = useSyncStatus();
  if (!s) return null;

  const pending = s.pendingRows + s.pendingUploads;
  let text: string;
  let bg = colors.surfaceAlt;
  let fg = colors.textMuted;
  let dot = colors.textMuted;

  if (!s.online) {
    text = `Offline — ${pending} item${pending === 1 ? '' : 's'} waiting to sync`;
    bg = colors.warningSoft;
    fg = colors.warning;
    dot = colors.warning;
  } else if (s.running) {
    text = 'Syncing…';
    bg = colors.primarySoft;
    fg = colors.primaryDark;
    dot = colors.primary;
  } else if (pending > 0) {
    text = `${pending} item${pending === 1 ? '' : 's'} queued`;
    bg = colors.primarySoft;
    fg = colors.primaryDark;
    dot = colors.primary;
  } else {
    text = 'All changes synced';
    bg = colors.successSoft;
    fg = colors.success;
    dot = colors.success;
  }

  return (
    <Pressable onPress={() => runSync()}>
      <View style={[styles.banner, { backgroundColor: bg }]}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.text, { color: fg }]}>{text}</Text>
          {s.pendingUploads > 0 ? (
            <Text style={[styles.sub, { color: fg }]}>
              {s.pendingUploads} recording{s.pendingUploads === 1 ? '' : 's'} uploading
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    borderRadius: radius.md,
    marginBottom: spacing(2),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 1, opacity: 0.85 },
});
