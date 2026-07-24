import React, { useCallback, useState } from 'react';
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
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

interface EventOverview {
  id: string;
  title: string;
  status: string;
  owner: string;
}

export default function AdminHome() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventOverview[]>([]);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
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
    const { count } = await supabase
      .from('transcripts')
      .select('id', { count: 'exact', head: true })
      .in('status', ['done', 'rejected']);
    setPending(count ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Admin</H1>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Row>

      <Card onPress={() => router.push('/admin/approvals')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Approval queue</H2>
          <Badge
            text={`${pending} waiting`}
            color={pending ? colors.warning : colors.success}
          />
        </Row>
        <P muted>Review and approve transcripts. Bulk-approve the clean ones.</P>
      </Card>

      <Row>
        <Button title="Users" variant="secondary" onPress={() => router.push('/admin/users')} />
        <Button title="Settings" variant="secondary" onPress={() => router.push('/admin/settings')} />
      </Row>

      <H2>All events (oversight)</H2>
      {events.length === 0 ? (
        <Empty text="No events yet." />
      ) : (
        events.map((e) => (
          <Card key={e.id} onPress={() => router.push(`/events/${e.id}/insights`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <P>{e.title}</P>
              <Badge text={e.status} />
            </Row>
            <P muted>Owner: {e.owner}</P>
          </Card>
        ))
      )}
    </Screen>
  );
}
