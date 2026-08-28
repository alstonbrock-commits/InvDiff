import React from 'react';
import { Text, TextStyle } from 'react-native';

interface EyebrowProps {
  children: string;
  color?: string;
  style?: TextStyle;
}

// Mono section label: 9.5px, 0.2em tracking (→1.9pt), uppercase.
export default function Eyebrow({ children, color = '#8A9499', style }: EyebrowProps) {
  return (
    <Text
      style={[
        {
          fontFamily: 'IBMPlexMono-400',
          fontSize: 9.5,
          letterSpacing: 1.9,
          textTransform: 'uppercase',
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
