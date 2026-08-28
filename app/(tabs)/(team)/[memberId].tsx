import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader, EventCard, Eyebrow } from '@/components';
import { useAuth } from '@/lib/auth';
import { useFocusData } from '@/lib/hooks';
import { displayRef, listVisibleEventsWithCounts } from '@/lib/db/queries';
import { pillStatus, eventMeta } from '../(dashboard)';

// One team member's events, from the local mirror (so it works offline).
// Opening an event lands on the roster in read-only mode.
export default function TeamMember() {
  const router = useRouter();
  const { memberId, name } = useLocalSearchParams<{ memberId: string; name?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data } = useFocusData(async () => {
    if (!userId || !memberId) return null;
    const events = await listVisibleEventsWithCounts(userId, true);
    return events.filter((e) => e.owner_id === memberId);
  }, [userId, memberId]);

  const events = data ?? [];
  const finalised = events.filter((e) => e.status === 'finalised').length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title={name ?? 'Team member'}
        subtitle={
          data
            ? `${events.length} event${events.length === 1 ? '' : 's'} · ${finalised} with a report`.toUpperCase()
            : ''
        }
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}
      >
        {data && events.length === 0 && (
          <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, lineHeight: 19.5, color: '#5D6B70' }}>
            Nothing logged yet. Their events appear here as soon as they sync.
          </Text>
        )}
        {events.length > 0 && <Eyebrow>Newest first</Eyebrow>}
        {events.map((event) => {
          const pill = pillStatus(event.status, false);
          return (
            <EventCard
              key={event.id}
              eventId={displayRef(event.id)}
              title={event.title}
              meta={eventMeta(event)}
              status={pill.status}
              statusLabel={pill.label}
              padding={13}
              onPress={() =>
                router.push({ pathname: '/select-interviewee', params: { eventId: event.id } })
              }
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
