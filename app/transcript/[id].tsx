import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, H1, H2, Input, P, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  approveTranscript,
  fetchEventTranscripts,
  rejectTranscript,
  saveTranscriptEdit,
  TranscriptDetail,
} from '@/lib/remote';
import { supabase } from '@/lib/supabase';
import { colors, scoreColor, spacing } from '@/lib/theme';

// Renders transcript text with low-scoring segments highlighted, so the
// reviewer focuses on the uncertain spans instead of re-reading everything.
function HighlightedText({ t }: { t: TranscriptDetail }) {
  if (t.edited_text) {
    // Once edited, show the edited text plainly (segments no longer align).
    return <P>{t.edited_text}</P>;
  }
  if (!t.segments || t.segments.length === 0) {
    return <P>{t.text ?? '(no transcript)'}</P>;
  }
  return (
    <Text style={styles.body}>
      {t.segments.map((s, i) => (
        <Text
          key={i}
          style={s.flagged ? styles.flagged : undefined}
        >
          {s.text}{' '}
        </Text>
      ))}
    </Text>
  );
}

export default function TranscriptScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [t, setT] = useState<TranscriptDetail | null>(null);
  const [edit, setEdit] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    // Fetch the single transcript via its event, then filter (keeps one query
    // shape). eventId is passed when navigating; otherwise resolve it.
    let ev = eventId;
    if (!ev) {
      const { data } = await supabase
        .from('transcripts')
        .select('answers!inner(interviewees!inner(event_id))')
        .eq('id', id)
        .single();
      // deno-lint-ignore no-explicit-any
      ev = (data as any)?.answers?.interviewees?.event_id;
    }
    if (!ev) return;
    const list = await fetchEventTranscripts(ev);
    const found = list.find((x) => x.id === id) ?? null;
    setT(found);
    setEdit(found?.edited_text ?? found?.text ?? '');
  }, [id, eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!t) return <Screen><P>Loading…</P></Screen>;

  async function saveEdit() {
    setBusy(true);
    try {
      await saveTranscriptEdit(t!.id, edit);
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(withEdit: boolean) {
    setBusy(true);
    try {
      await approveTranscript(t!.id, withEdit ? edit : undefined);
      router.back();
    } catch (e) {
      Alert.alert('Could not approve', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReject(note: string) {
    setBusy(true);
    try {
      await rejectTranscript(t!.id, note);
      router.back();
    } catch (e) {
      Alert.alert('Could not reject', String(e));
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    // Alert.prompt is iOS-only; fall back to a rejection note field on Android
    // via the inline editor is out of scope, so reject with an empty note there.
    const prompt = (
      Alert as unknown as {
        prompt?: (
          t: string,
          m: string,
          cb: (v?: string) => void,
        ) => void;
      }
    ).prompt;
    if (typeof prompt === 'function') {
      prompt('Reject transcript', 'Add a note for the facilitator.', (note) =>
        doReject(note ?? ''),
      );
    } else {
      void doReject('');
    }
  }

  return (
    <Screen>
      <H1>
        {t.interviewee_name} — Q{t.question_position}
      </H1>
      <P muted>{t.question_text}</P>

      <Row style={{ justifyContent: 'space-between' }}>
        <Badge
          text={`audio quality ${t.quality_score ?? '—'}`}
          color={scoreColor(t.quality_score)}
        />
        {t.flagged_segment_count > 0 ? (
          <Badge text={`${t.flagged_segment_count} flagged`} color={colors.warning} />
        ) : null}
        <Badge text={t.status} />
      </Row>

      {t.rejection_note ? (
        <Card>
          <P muted>Rejection note:</P>
          <P>{t.rejection_note}</P>
        </Card>
      ) : null}

      <Card>
        <H2>Transcript</H2>
        <P muted>
          Score reflects audio quality, not accuracy — a clear-sounding segment
          can still be wrong. Highlighted spans scored low; check those first.
        </P>
        {editing ? (
          <Input value={edit} onChangeText={setEdit} multiline style={{ minHeight: 160 }} />
        ) : (
          <HighlightedText t={t} />
        )}
      </Card>

      {editing ? (
        <Row>
          <View style={{ flex: 1 }}>
            <Button title="Save edit" onPress={saveEdit} loading={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        </Row>
      ) : (
        <Button title="Edit transcript" variant="secondary" onPress={() => setEditing(true)} />
      )}

      {isAdmin ? (
        <Card>
          <H2>Admin review</H2>
          <Button
            title={editing ? 'Approve with edits' : 'Approve'}
            onPress={() => approve(editing)}
            loading={busy}
          />
          <Button title="Reject back to facilitator" variant="danger" onPress={reject} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  flagged: {
    backgroundColor: 'rgba(251,191,36,0.25)',
    color: colors.text,
  },
});
