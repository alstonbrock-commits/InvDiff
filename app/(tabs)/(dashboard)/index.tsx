import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader, StatTile, EventCard, Button } from '@/components';
import { useAuth } from '@/lib/auth';
import { useFocusData } from '@/lib/hooks';
import { useEntitlement } from '@/lib/entitlement';
import { promptSubscribe } from '@/lib/paywallPrompt';
import {
  displayRef,
  eventStatusCounts,
  listMyEventsWithCounts,
  unsyncedEventIds,
  type EventListItem,
} from '@/lib/db/queries';
import type { EventStatus } from '@/components/StatusPill';

// Local event status → design pill status.
export function pillStatus(
  status: string,
  unsynced: boolean,
): { status: EventStatus; label?: string } {
  if (status === 'finalised') return { status: 'completed' };
  if (status === 'draft')
    return { status: 'draft', label: unsynced ? 'DRAFT · OFFLINE' : 'DRAFT' };
  return { status: 'needs-review' };
}

export function eventMeta(e: EventListItem): string {
  const n = e.interviewee_count;
  const people = `${n} interviewee${n === 1 ? '' : 's'}`;
  return e.site ? `${e.site} · ${people}` : people;
}

export default function Dashboard() {
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const ent = useEntitlement();

  const { data } = useFocusData(
    async () => {
      if (!ownerId) return null;
      const [counts, events, unsynced] = await Promise.all([
        eventStatusCounts(ownerId),
        listMyEventsWithCounts(ownerId),
        unsyncedEventIds(),
      ]);
      return { counts, recent: events.slice(0, 2), unsynced };
    },
    [ownerId],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="brand" showWatermark />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 20,
          paddingHorizontal: 16,
          paddingBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <StatTile
            number={data?.counts.finalised ?? '—'}
            caption="Completed events"
            status="completed"
          />
          <StatTile
            number={data?.counts.active ?? '—'}
            caption="Events needing review"
            status="needs-review"
          />
        </View>

        <Text
          style={{
            fontFamily: 'Archivo-700',
            fontSize: 14,
            color: '#17262D',
            marginBottom: 10,
          }}
        >
          Recent events
        </Text>

        {data && data.recent.length === 0 && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
              marginBottom: 10,
            }}
          >
            No events yet — log your first one below.
          </Text>
        )}

        {data?.recent.map((event) => {
          const pill = pillStatus(event.status, data.unsynced.has(event.id));
          return (
            <View key={event.id} style={{ marginBottom: 10 }}>
              <EventCard
                eventId={displayRef(event.id)}
                title={event.title}
                meta={eventMeta(event)}
                status={pill.status}
                statusLabel={pill.label}
                padding={14}
                onPress={() =>
                  router.push({ pathname: '/select-interviewee', params: { eventId: event.id } })
                }
              />
            </View>
          );
        })}

        <View style={{ marginTop: 'auto' }}>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            // View-only once the free report is used: subscribing unlocks it.
            onPress={() => (ent.active ? router.push('/log-new-event') : promptSubscribe(router))}
          >
            Log new event
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
