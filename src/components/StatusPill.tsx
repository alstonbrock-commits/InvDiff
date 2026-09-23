import React from 'react';
import { View, Text } from 'react-native';

export type EventStatus = 'needs-review' | 'completed' | 'draft';

const STATUS = {
  'needs-review': {
    label: 'NEEDS REVIEW',
    color: '#E4772A',
    background: 'rgba(228,119,42,0.12)',
  },
  completed: {
    label: 'COMPLETED',
    color: '#2CA5C0',
    background: 'rgba(44,165,192,0.14)',
  },
  draft: {
    label: 'DRAFT · OFFLINE',
    color: '#5D6B70',
    background: '#EFEDE7',
  },
} as const;

interface StatusPillProps {
  status: EventStatus;
  /** Overrides the status's default label. */
  label?: string;
}

export default function StatusPill({ status, label }: StatusPillProps) {
  const s = STATUS[status];

  return (
    <View
      style={{
        backgroundColor: s.background,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 20,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontFamily: 'Archivo-700', fontSize: 10, color: s.color }}>
        {label ?? s.label}
      </Text>
    </View>
  );
}
