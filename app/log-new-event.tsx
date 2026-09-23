import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ScreenHeader,
  Field,
  PersonTile,
  Button,
  OfflineNote,
  DashedBorder,
  alertDialog,
} from '@/components';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/lib/hooks';
import { addInterviewee, addPhoto, createEvent, setEventStatus } from '@/lib/db/queries';
import { runSync, useSyncStatus } from '@/lib/sync/SyncProvider';
import { initialsOf, joinNames } from '@/lib/names';

const LABEL = {
  fontFamily: 'PublicSans-700',
  fontSize: 11,
  color: '#5D6B70',
  marginBottom: 6,
} as const;

// A joint interview holds several people — one entry, many names.
interface PendingPerson {
  names: string[];
  role: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export default function LogNewEvent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { session } = useAuth();
  const sync = useSyncStatus();

  // Date/Time default to now — real values, not fixture copy.
  const now = new Date();
  const [date, setDate] = useState(formatDate(now));
  const [time, setTime] = useState(formatTime(now));
  const [site, setSite] = useState('');
  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [people, setPeople] = useState<PendingPerson[]>([]);
  const [adding, setAdding] = useState(false);
  const [newNames, setNewNames] = useState<string[]>(['']);
  const [newRole, setNewRole] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addPerson = () => {
    const names = newNames.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setPeople((p) => [...p, { names, role: newRole.trim() }]);
    setNewNames(['']);
    setNewRole('');
    setAdding(false);
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) {
      setPhotos((p) => [...p, res.assets[0].uri]);
    }
  };

  const save = async () => {
    if (saving) return;
    const ownerId = session?.user.id;
    if (!ownerId) return;
    // Every field on this form is required.
    if (!site.trim()) {
      alertDialog('Site is required', 'Enter where the event happened.');
      return;
    }
    if (!eventName.trim()) {
      alertDialog('Event name is required');
      return;
    }
    if (!description.trim()) {
      alertDialog('Description is required', 'A sentence or two about what happened.');
      return;
    }
    if (people.length === 0) {
      alertDialog('No interviewees yet', 'Add at least one interviewee.');
      return;
    }
    setSaving(true);
    try {
      // Best-effort parse of the editable date/time; falls back to now.
      const parsed = new Date(`${date} ${time}`);
      const occurredAt = isNaN(parsed.getTime())
        ? new Date().toISOString()
        : parsed.toISOString();

      const eventId = await createEvent(ownerId, {
        title: eventName.trim(),
        description: description.trim(),
        site: site.trim(),
        occurredAt,
      });
      for (const person of people) {
        await addInterviewee(eventId, joinNames(person.names), person.role);
      }
      for (let i = 0; i < photos.length; i++) {
        await addPhoto(eventId, photos[i], i + 1);
      }
      await setEventStatus(eventId, 'active');
      void runSync();
      router.replace({ pathname: '/select-interviewee', params: { eventId } });
    } catch (e) {
      alertDialog('Could not save the event', String(e));
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="titled" title="Log new event" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, paddingBottom: keyboardHeight, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Date" value={date} onChangeText={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={time} onChangeText={setTime} />
          </View>
        </View>

        <Field
          label="Site"
          value={site}
          onChangeText={setSite}
          placeholder="Northgate Depot"
        />

        <Field
          label="Event name"
          value={eventName}
          onChangeText={setEventName}
          placeholder="Near-miss · loading dock"
        />

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What happened, in a sentence or two"
          multiline
          inputStyle={{ fontSize: 13, color: '#3A474D' }}
        />

        <View>
          <Text style={LABEL}>Interviewees</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {people.map((person) => {
              const name = joinNames(person.names);
              return (
                <View key={name} style={{ width: '31%' }}>
                  <PersonTile initials={initialsOf(name)} name={name} />
                </View>
              );
            })}
            <View style={{ width: '31%' }}>
              <PersonTile isAdd onPress={() => setAdding(true)} />
            </View>
          </View>

          {adding && (
            <View style={{ gap: 10, marginTop: 12 }}>
              {newNames.map((n, i) => (
                <Field
                  key={i}
                  label={i === 0 ? 'Name' : `Person ${i + 1} name`}
                  value={n}
                  onChangeText={(t) =>
                    setNewNames((ns) => ns.map((x, j) => (j === i ? t : x)))
                  }
                  placeholder="K. Rao"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              ))}
              <Pressable onPress={() => setNewNames((ns) => [...ns, ''])} hitSlop={6}>
                <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
                  + Add another person to this interview
                </Text>
              </Pressable>
              <Field
                label="Role or segment"
                value={newRole}
                onChangeText={setNewRole}
                placeholder="Witness · pedestrian on walkway"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" size="sm" fullWidth onPress={() => setAdding(false)}>
                    Cancel
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button variant="primary" size="sm" fullWidth onPress={addPerson}>
                    Add
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>

        <View>
          <Text style={LABEL}>Photos</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: '#E5E3DC',
                }}
              />
            ))}
            <Pressable onPress={pickPhoto}>
              <DashedBorder radius={11}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20, color: '#8A9499' }}>+</Text>
                </View>
              </DashedBorder>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Hidden while typing — the pinned footer otherwise sits over the
          bottom fields when the keyboard resizes the window. */}
      {keyboardHeight === 0 && (
        <View style={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 + insets.bottom }}>
          <View style={{ marginBottom: 10 }}>
            <OfflineNote>
              {sync?.online === false
                ? 'Saved on device — will sync when back online'
                : 'Saved on device and synced automatically'}
            </OfflineNote>
          </View>
          <Button variant="primary" fullWidth onPress={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save & start interview'}
          </Button>
        </View>
      )}
    </View>
  );
}
