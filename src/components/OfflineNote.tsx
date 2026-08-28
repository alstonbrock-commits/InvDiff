import React from 'react';
import { View, Text } from 'react-native';

interface OfflineNoteProps {
  children: string;
}

// Reference draws this as a bare dot + line — no tinted background or card.
export default function OfflineNote({ children }: OfflineNoteProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#2CA5C0',
        }}
      />
      <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11, color: '#5D6B70' }}>
        {children}
      </Text>
    </View>
  );
}
