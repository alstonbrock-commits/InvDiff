import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, H1, Input, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createEvent } from '@/lib/db/queries';

export default function NewEvent() {
  const { profile } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!profile || !title.trim()) return;
    setBusy(true);
    try {
      const id = await createEvent(profile.id, title.trim(), description.trim());
      router.replace(`/events/${id}`);
    } catch (e) {
      Alert.alert('Could not create event', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>New Event</H1>
      <P muted>
        Seven default questions are added automatically. You can edit their
        wording before you start interviewing.
      </P>
      <Input
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. North region site visit"
      />
      <Input
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Button
        title="Create event"
        onPress={onCreate}
        loading={busy}
        disabled={!title.trim()}
      />
    </Screen>
  );
}
