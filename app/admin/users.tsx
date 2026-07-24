import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Empty,
  H1,
  H2,
  Input,
  P,
  Row,
  Screen,
} from '@/components/ui';
import { inviteUser } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { colors } from '@/lib/theme';

export default function Users() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'facilitator' | 'admin'>('facilitator');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setProfiles((data as Profile[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await inviteUser(email.trim(), name.trim(), role);
      Alert.alert('Invitation sent', `${email} was invited as ${role}.`);
      setEmail('');
      setName('');
      await load();
    } catch (e) {
      Alert.alert('Invite failed', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Users</H1>
      <Card>
        <H2>Invite a user</H2>
        <P muted>No public sign-up. Invited users set a password on first login.</P>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Input label="Full name (optional)" value={name} onChangeText={setName} />
        <Row>
          <Button
            title="Facilitator"
            variant={role === 'facilitator' ? 'primary' : 'ghost'}
            onPress={() => setRole('facilitator')}
          />
          <Button
            title="Admin"
            variant={role === 'admin' ? 'primary' : 'ghost'}
            onPress={() => setRole('admin')}
          />
        </Row>
        <Button title="Send invite" onPress={invite} loading={busy} disabled={!email.trim()} />
      </Card>

      <H2>Existing users</H2>
      {profiles.length === 0 ? (
        <Empty text="No users yet." />
      ) : (
        profiles.map((p) => (
          <Card key={p.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <P>{p.full_name || p.email}</P>
                <P muted>{p.email}</P>
              </View>
              <Badge
                text={p.role}
                color={p.role === 'admin' ? colors.primary : colors.textMuted}
              />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
