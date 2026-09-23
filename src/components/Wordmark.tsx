import React from 'react';
import { View, Text } from 'react-native';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  /** The surface it sits on: 'navy' → "Insight" in white, 'light' → #17262D. */
  surface?: 'navy' | 'light';
}

// letterSpacing is in points in RN, not em. The design is -0.02em at every size,
// so each size gets its own converted value — do not collapse these to one number.
const SIZES = {
  sm: { fontSize: 24, letterSpacing: -0.48 },
  md: { fontSize: 34, letterSpacing: -0.68 },
  lg: { fontSize: 38, letterSpacing: -0.76 },
} as const;

export default function Wordmark({ size = 'md', surface = 'navy' }: WordmarkProps) {
  const { fontSize, letterSpacing } = SIZES[size];

  const base = {
    fontFamily: 'Archivo-800',
    fontSize,
    letterSpacing,
    lineHeight: fontSize,
  } as const;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ ...base, color: '#E4772A' }}>Event</Text>
      <Text style={{ ...base, color: surface === 'navy' ? '#FFFFFF' : '#17262D' }}>
        Insight
      </Text>
    </View>
  );
}
