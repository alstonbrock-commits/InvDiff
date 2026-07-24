import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActionTile,
  Badge,
  Button,
  Card,
  Empty,
  H2,
  HeaderScreen,
  NavyHeader,
  Row,
  StatTile,
} from '@/components/ui';
import { SyncBanner } from '@/components/SyncBanner';
import { useAuth } from '@/lib/auth';
import { listMyEvents } from '@/lib/db/queries';
import type { EventRow } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const statusAccent: Record<string, string> = {
  draft: colors.muted,
  active: colors.orange,
  finalised: colors.teal,
};

function shortId(id: string): string {
  return 'EVT-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

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

  const completed = events.filter((e) => e.status === 'finalised').length;
  const open = events.filter((e) => e.status !== 'finalised').length;
  const active = events.filter((e) => e.status === 'active').length;

  return (
    <HeaderScreen
      header={
        <NavyHeader
          stat={{
            label: 'Open investigations',
            value: open,
            pill: active ? `${active} active` : undefined,
          }}
          right={
            <Pressable onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          }
        />
      }
    >
      <SyncBanner />

      <Row style={{ gap: spacing(3) }}>
        <StatTile label="Your events" value={events.length} />
        <StatTile label="Completed" value={completed} accent={colors.teal} />
      </Row>

      {isAdmin ? (
        <ActionTile
          title="Admin dashboard"
          subtitle="Usage, approvals, settings"
          onPress={() => router.push('/admin')}
        />
      ) : null}

      <H2>Recent events</H2>
      {events.length === 0 ? (
        <Empty text="No events yet. Log one to start interviewing." />
      ) : (
        events.map((e) => (
          <Card key={e.id} accent={statusAccent[e.status]} onPress={() => router.push(`/events/${e.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.evId}>{shortId(e.id)}</Text>
              <Badge text={e.status} color={statusAccent[e.status]} soft />
            </Row>
            <Text style={styles.evTitle}>{e.title}</Text>
            <Text style={styles.evMeta}>{new Date(e.created_at).toLocaleDateString()}</Text>
          </Card>
        ))
      )}
      <View style={{ height: spacing(2) }} />
      <Button title="Log new event" onPress={() => router.push('/events/new')} />
    </HeaderScreen>
  );
}

const styles = StyleSheet.create({
  signOut: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  signOutText: { fontFamily: fonts.bodySemi, color: '#FFFFFF', fontSize: 12 },
  evId: { fontFamily: fonts.mono, color: colors.muted, fontSize: 11, letterSpacing: 1 },
  evTitle: { fontFamily: fonts.bodySemi, color: colors.navyText, fontSize: 15 },
  evMeta: { fontFamily: fonts.body, color: colors.slate, fontSize: 13 },
});
