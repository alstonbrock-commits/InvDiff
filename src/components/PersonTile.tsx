import React from 'react';
import { View, Text, Pressable } from 'react-native';
import DashedBorder from './DashedBorder';

interface PersonTileProps {
  initials?: string;
  name?: string;
  isAdd?: boolean;
  onPress?: () => void;
}

const CONTENT = {
  paddingVertical: 10,
  paddingHorizontal: 8,
  alignItems: 'center',
  gap: 6,
} as const;

const CIRCLE = {
  width: 26,
  height: 26,
  borderRadius: 13,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const LABEL = {
  fontFamily: 'PublicSans-600',
  fontSize: 11.5,
} as const;

export default function PersonTile({ initials, name, isAdd = false, onPress }: PersonTileProps) {
  if (isAdd) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <DashedBorder radius={11}>
          <View style={CONTENT}>
            <View style={CIRCLE}>
              <Text style={{ fontSize: 18, lineHeight: 18, color: '#8A9499' }}>+</Text>
            </View>
            <Text style={{ ...LABEL, color: '#5D6B70' }}>Add</Text>
          </View>
        </DashedBorder>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E3DC',
        borderRadius: 11,
        ...CONTENT,
      }}
    >
      <View style={{ ...CIRCLE, backgroundColor: '#E7EEF0' }}>
        <Text style={{ fontFamily: 'Archivo-800', fontSize: 10, color: '#2CA5C0' }}>
          {initials}
        </Text>
      </View>
      <Text style={{ ...LABEL, color: '#17262D' }}>{name}</Text>
    </View>
  );
}
