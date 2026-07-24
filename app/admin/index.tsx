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
  P,
  Row,
  StatTile,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, spacing } from '@/lib/theme';

interface EventOverview {
  id: string;
  title: string;
  status: string;
  owner: string;
}
interface Notif {
  id: string;
  event_id: string | null;
  message: string;
  seen_at: string | null;
  created_at: string;
}

const statusAccent: Record<string, string> = {
  draft: colors.muted,
  active: colors.orange,
  finalised: colors.teal,
};

function shortId(id: string): string {
  return 'EVT-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

export default function AdminHome() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventOverview[]>([]);
  const [stats, setStats] = useState({ users: 0, events: 0, completed: 0 });
  const [notifs, setNotifs] = useState<Notif[]>([]);

  const load = useCallback(async () => {
    const [{ count: users }, { count: evAll }, { count: evDone }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'facilitator'),
      supabase.from('events').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'finalised').is('deleted_at', null),
    ]);
    setStats({ users: users ?? 0, events: evAll ?? 0, completed: evDone ?? 0 });

    const { data: notifData } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);
    setNotifs((notifData as Notif[]) ?? []);

    const { data } = await supabase
      .from('events')
      .select('id, title, status, profiles:owner_id(full_name, email)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setEvents(
      (data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        // deno-lint-ignore no-explicit-any
        owner: (e as any).profiles?.full_name || (e as any).profiles?.email || '—',
      })),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unseen = notifs.filter((n) => !n.seen_at);

  async function markAllSeen() {
    await supabase
      .from('admin_notifications')
      .update({ seen_at: new Date().toISOString() })
      .is('seen_at', null);
    void load();
  }

  return (
    <HeaderScreen
      header={
        <NavyHeader
          stat={{
            label: 'Events logged',
            value: stats.events,
            pill: unseen.length ? `${unseen.length} new` : undefined,
          }}
          right={
            <Pressable onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          }
        />
      }
    >
      {/* Usage stats */}
      <Row style={{ gap: spacing(3) }}>
        <StatTile label="Facilitators" value={stats.users} />
        <StatTile label="Completed" value={stats.completed} accent={colors.teal} />
      </Row>

      {/* Notifications feed */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Logged events</H2>
          {unseen.length > 0 ? <Badge text={`${unseen.length} new`} color={colors.orange} soft /> : null}
        </Row>
        {notifs.length === 0 ? (
          <P muted>No events logged yet. You&apos;ll be alerted here (and by email) when a facilitator finalises one.</P>
        ) : (
          <>
            {notifs.slice(0, 6).map((n) => (
              <View
                key={n.id}
                style={[styles.notif, !n.seen_at && { backgroundColor: colors.orangeTint }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifMsg}>{n.message}</Text>
                  <Text style={styles.notifTime}>{new Date(n.created_at).toLocaleString()}</Text>
                </View>
                {n.event_id ? (
                  <Button title="View" variant="ghost" onPress={() => router.push(`/events/${n.event_id}/insights`)} />
                ) : null}
              </View>
            ))}
            {unseen.length > 0 ? <Button title="Mark all seen" variant="secondary" onPress={markAllSeen} /> : null}
          </>
        )}
      </Card>

      <Row style={{ gap: spacing(3) }}>
        <View style={{ flex: 1 }}>
          <ActionTile title="Questions" onPress={() => router.push('/admin/questions')} />
        </View>
        <View style={{ flex: 1 }}>
          <ActionTile title="Settings" onPress={() => router.push('/admin/settings')} />
        </View>
      </Row>

      <H2>All events</H2>
      {events.length === 0 ? (
        <Empty text="No events yet." />
      ) : (
        events.map((e) => (
          <Card key={e.id} accent={statusAccent[e.status]} onPress={() => router.push(`/events/${e.id}/insights`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.evId}>{shortId(e.id)}</Text>
              <Badge text={e.status} color={statusAccent[e.status]} soft />
            </Row>
            <Text style={styles.evTitle}>{e.title}</Text>
            <Text style={styles.evMeta}>Facilitator: {e.owner}</Text>
          </Card>
        ))
      )}
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
  notif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    borderRadius: radius.md,
    padding: spacing(2.5),
  },
  notifMsg: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 14 },
  notifTime: { fontFamily: fonts.mono, color: colors.muted, fontSize: 10, marginTop: 2 },
  evId: { fontFamily: fonts.mono, color: colors.muted, fontSize: 11, letterSpacing: 1 },
  evTitle: { fontFamily: fonts.bodySemi, color: colors.navyText, fontSize: 15 },
  evMeta: { fontFamily: fonts.body, color: colors.slate, fontSize: 13 },
});

