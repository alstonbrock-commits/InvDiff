import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Empty,
  H1,
  H2,
  P,
  Row,
  Screen,
} from '@/components/ui';
import { SyncBanner } from '@/components/SyncBanner';
import { useAuth } from '@/lib/auth';
import { listMyEvents } from '@/lib/db/queries';
import type { EventRow } from '@/lib/types';
import { colors } from '@/lib/theme';

const statusColor: Record<string, string> = {
  draft: colors.textMuted,
  active: colors.primary,
  finalised: colors.success,
};

export default function EventsList() {
  const { profile, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = useCallback(async () => {
    if (profile) setEvents(await listMyEvents(profile.id));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <SyncBanner />
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>My Events</H1>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Row>

      {isAdmin ? (
        <Button
          title="Go to Admin"
          variant="secondary"
          onPress={() => router.push('/admin')}
        />
      ) : null}

      <Button title="+ New Event" onPress={() => router.push('/events/new')} />

      {events.length === 0 ? (
        <Empty text="No events yet. Create one to start interviewing." />
      ) : (
        events.map((e) => (
          <Card key={e.id} onPress={() => router.push(`/events/${e.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>{e.title}</H2>
              <Badge text={e.status} color={statusColor[e.status]} />
            </Row>
            {e.description ? <P muted>{e.description}</P> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
