import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, H1, Input, P, Screen } from '@/components/ui';
import { addInterviewee } from '@/lib/db/queries';

export default function NewInterviewee() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [busy, setBusy] = useState(false);

  async function onAdd() {
    if (!eventId || !name.trim()) return;
    setBusy(true);
    try {
      const id = await addInterviewee(eventId, name.trim(), segment.trim());
      router.replace(`/interviewee/${id}`);
    } catch (e) {
      Alert.alert('Could not add interviewee', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Add Interviewee</H1>
      <P muted>
        You&apos;ll capture consent, then record answers to the seven questions.
      </P>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Full name" />
      <Input
        label="Role / segment (optional)"
        value={segment}
        onChangeText={setSegment}
        placeholder="e.g. front-line staff"
      />
      <Button title="Add & start" onPress={onAdd} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
