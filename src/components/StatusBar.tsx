import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StatusBarProps {
  variant?: 'light' | 'dark';
}

// Spacer for the device's real status bar. The reference draws a 44px row with a
// mock "9:41" and battery glyph — that's mock furniture, not UI. We reserve the
// real inset instead, falling back to the reference's 44px where the inset is
// smaller (Android) so the header proportions hold.
export default function StatusBar({ variant = 'light' }: StatusBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        height: Math.max(insets.top, 44),
        backgroundColor: variant === 'light' ? '#FFFFFF' : '#1B2B3A',
      }}
    />
  );
}
