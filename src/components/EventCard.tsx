import React from 'react';
import { View, Text, Pressable } from 'react-native';
import StatusPill, { type EventStatus } from './StatusPill';

const ACCENT: Record<EventStatus, string> = {
  'needs-review': '#E4772A',
  completed: '#2CA5C0',
  draft: '#8A9499',
};

interface EventCardProps {
  eventId: string;
  title: string;
  meta: string;
  status: EventStatus;
  /** Overrides the pill's default label (e.g. plain "DRAFT" when synced). */
  statusLabel?: string;
  /** Reference uses 14 on Dashboard, 13 on Events. */
  padding?: number;
  onPress?: () => void;
}

export default function EventCard({
  eventId,
  title,
  meta,
  status,
  statusLabel,
  padding = 14,
  onPress,
}: EventCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E3DC',
        borderLeftWidth: 4,
        borderLeftColor: ACCENT[status],
        padding,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 10, color: '#8A9499' }}>
          {eventId}
        </Text>
        <StatusPill status={status} label={statusLabel} />
      </View>
      <Text
        style={{
          fontFamily: 'PublicSans-600',
          fontSize: 14,
          color: '#17262D',
          marginTop: 6,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontFamily: 'PublicSans-400', fontSize: 12, color: '#5D6B70' }}>
        {meta}
      </Text>
    </Pressable>
  );
}
