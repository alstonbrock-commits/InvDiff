import React from 'react';
import { View, Text, Pressable } from 'react-native';

export interface ListCardRow {
  label: string;
  /** 'data' rows: the right-hand value. */
  value?: string;
  /** 'nav' rows: secondary line under the label. */
  sublabel?: string;
  accessory?: 'chevron' | 'external';
  onPress?: () => void;
}

interface ListCardProps {
  /** 'data' = label/value pairs (padding 13); 'nav' = tappable rows (padding 14/13). */
  variant?: 'data' | 'nav';
  /** 'nav' only — reference uses 13.5 on Account, 13 on Help & support. */
  labelSize?: number;
  rows: ListCardRow[];
}

export default function ListCard({
  variant = 'data',
  labelSize = 13.5,
  rows,
}: ListCardProps) {
  const isData = variant === 'data';

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E3DC',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, index) => (
        <Pressable
          key={row.label}
          onPress={row.onPress}
          disabled={!row.onPress}
          style={{
            paddingVertical: isData || labelSize < 13.5 ? 13 : 14,
            paddingHorizontal: 13,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: index < rows.length - 1 ? 1 : 0,
            borderBottomColor: '#EFEDE7',
          }}
        >
          <View style={isData ? undefined : { flex: 1 }}>
            <Text
              style={
                isData
                  ? { fontFamily: 'PublicSans-400', fontSize: 12, color: '#5D6B70' }
                  : { fontFamily: 'PublicSans-600', fontSize: labelSize, color: '#17262D' }
              }
            >
              {row.label}
            </Text>
            {row.sublabel && (
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 11.5,
                  color: '#5D6B70',
                  marginTop: 2,
                }}
              >
                {row.sublabel}
              </Text>
            )}
          </View>

          {row.value && (
            <Text
              style={{
                fontFamily: 'PublicSans-600',
                fontSize: 13,
                color: '#17262D',
                flexShrink: 1,
              }}
            >
              {row.value}
            </Text>
          )}
          {row.accessory === 'chevron' && (
            <Text style={{ fontSize: 15, color: '#C7C3B9' }}>›</Text>
          )}
          {row.accessory === 'external' && (
            <Text style={{ fontFamily: 'PublicSans-700', fontSize: 14, color: '#2CA5C0' }}>
              ↗
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
