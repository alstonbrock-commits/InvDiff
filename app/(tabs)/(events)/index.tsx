import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader, EventCard, Eyebrow } from '@/components';
import { useAuth } from '@/lib/auth';
import { useFocusData } from '@/lib/hooks';
import {
  displayRef,
  listMyEventsWithCounts,
  unsyncedEventIds,
  type EventListItem,
} from '@/lib/db/queries';
import { pillStatus, eventMeta } from '../(dashboard)';

type FilterId = 'all' | 'review' | 'done';

function eventDate(e: EventListItem): Date {
  return new Date(e.occurred_at ?? e.created_at);
}

function groupHeading(d: Date, now: Date): string {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfDay) return 'Today';
  const weekAgo = new Date(startOfDay);
  weekAgo.setDate(weekAgo.getDate() - 6);
  if (d >= weekAgo) return 'Earlier this week';
  return 'Earlier';
}

export default function Events() {
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');

  const { data } = useFocusData(
    async () => {
      if (!ownerId) return null;
      const [events, unsynced] = await Promise.all([
        listMyEventsWithCounts(ownerId),
        unsyncedEventIds(),
      ]);
      return { events, unsynced };
    },
    [ownerId],
  );

  const events = data?.events ?? [];
  const counts = {
    all: events.length,
    review: events.filter((e) => e.status === 'active').length,
    done: events.filter((e) => e.status === 'finalised').length,
  };
  const filters: { id: FilterId; label: string; color: string; bg: string }[] = [
    { id: 'all', label: `All ${counts.all}`, color: '#FFFFFF', bg: '#1B2B3A' },
    { id: 'review', label: `Review ${counts.review}`, color: '#E4772A', bg: 'rgba(228,119,42,0.12)' },
    { id: 'done', label: `Done ${counts.done}`, color: '#2CA5C0', bg: 'rgba(44,165,192,0.14)' },
  ];

  const q = search.trim().toLowerCase();
  const visible = events
    .filter((e) =>
      filter === 'all'
        ? true
        : filter === 'review'
          ? e.status === 'active' || e.status === 'draft'
          : e.status === 'finalised',
    )
    .filter(
      (e) =>
        !q ||
        [e.title, e.site ?? '', displayRef(e.id)].join(' ').toLowerCase().includes(q),
    );

  // Group in display order (list is already sorted desc by date).
  const now = new Date();
  const groups: { heading: string; events: EventListItem[] }[] = [];
  for (const e of visible) {
    const heading = groupHeading(eventDate(e), now);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.events.push(e);
    else groups.push({ heading, events: [e] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Events"
        searchPlaceholder="Search events, sites, IDs"
        searchValue={search}
        onSearchChange={setSearch}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* Filter pills — first row of the body, on paper */}
        <View
          style={{
            flexDirection: 'row',
            gap: 7,
            paddingTop: 14,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          {filters.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                backgroundColor: f.bg,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 20,
                opacity: filter === f.id ? 1 : 0.55,
              }}
            >
              <Text
                style={{ fontFamily: 'PublicSans-700', fontSize: 11, color: f.color }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {data && visible.length === 0 && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              {q ? 'Nothing matches that search.' : 'No events here yet.'}
            </Text>
          )}

          {groups.map((group, groupIndex) => (
            <React.Fragment key={group.heading}>
              <Eyebrow style={{ marginTop: groupIndex > 0 ? 4 : 0 }}>
                {group.heading}
              </Eyebrow>
              {group.events.map((event) => {
                const pill = pillStatus(
                  event.status,
                  data?.unsynced.has(event.id) ?? false,
                );
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
                      router.push({
                        pathname: '/select-interviewee',
                        params: { eventId: event.id },
                      })
                    }
                  />
                );
              })}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
