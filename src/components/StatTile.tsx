import React from 'react';
import { Pressable, Text } from 'react-native';

interface StatTileProps {
  number: string | number;
  caption: string;
  status: 'completed' | 'needs-review';
  /** When provided, the tile is a drill-down button (visuals unchanged). */
  onPress?: () => void;
}

export default function StatTile({ number, caption, status, onPress }: StatTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E3DC',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text
        style={{
          fontFamily: 'Archivo-800',
          fontSize: 22,
          color: status === 'completed' ? '#2CA5C0' : '#E4772A',
        }}
      >
        {number}
      </Text>
      <Text
        style={{
          fontFamily: 'PublicSans-400',
          fontSize: 11,
          color: '#5D6B70',
          marginTop: 2,
        }}
      >
        {caption}
      </Text>
    </Pressable>
  );
}
