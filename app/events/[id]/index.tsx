import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActionTile, Button, Card, Empty, H1, H2, P, Row, Screen } from '@/components/ui';
import { SyncBanner } from '@/components/SyncBanner';
import {
  eventProgress,
  getEvent,
  listAnswersForEvent,
  listInterviewees,
  listQuestions,
  setEventStatus,
} from '@/lib/db/queries';
import type {
  AnswerRow,
  EventRow,
  IntervieweeRow,
  QuestionRow,
} from '@/lib/types';
import { notifyEventLogged } from '@/lib/ai';
import { colors, spacing } from '@/lib/theme';

// cell status → colour
function cellColor(a: AnswerRow | undefined): string {
  if (!a || !a.recorded_at) return colors.surfaceAlt; // not recorded
  if (a.upload_status === 'uploaded') return colors.success; // recorded + synced
  if (a.upload_status === 'failed') return colors.danger;
  return colors.warning; // recorded, upload pending
}

export default function EventGrid() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [interviewees, setInterviewees] = useState<IntervieweeRow[]>([]);
  const [answers, setAnswers] = useState<Map<string, AnswerRow>>(new Map());
  const [progress, setProgress] = useState({ recorded: 0, cells: 0, uploaded: 0 });

  const load = useCallback(async () => {
    if (!id) return;
    setEvent(await getEvent(id));
    setQuestions(await listQuestions(id));
    setInterviewees(await listInterviewees(id));
    const ans = await listAnswersForEvent(id);
    const map = new Map<string, AnswerRow>();
    ans.forEach((a) => map.set(`${a.interviewee_id}:${a.event_question_id}`, a));
    setAnswers(map);
    const p = await eventProgress(id);
    setProgress({ recorded: p.recorded, cells: p.cells, uploaded: p.uploaded });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!event) return <Screen><P>Loading…</P></Screen>;

  async function finalise() {
    Alert.alert(
      'Finalise event?',
      'This marks the event complete. You can still export and manage recordings afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalise',
          onPress: async () => {
            await setEventStatus(id!, 'finalised');
            // Best-effort admin email (in-app feed is guaranteed server-side).
            notifyEventLogged(id!).catch(() => {});
            void load();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SyncBanner />
      <H1>{event.title}</H1>
      <P muted>
        {progress.recorded}/{progress.cells} answers recorded ·{' '}
        {progress.uploaded} uploaded
      </P>

      <ActionTile
        tone="primary"
        title="Add interviewee"
        subtitle="Capture consent, then record answers"
        onPress={() => router.push(`/interviewee/new?eventId=${id}`)}
      />
      <ActionTile
        title="Review transcripts"
        subtitle="Approve or edit before generating insights"
        onPress={() => router.push(`/events/${id}/transcripts`)}
      />
      <Row style={{ gap: spacing(3) }}>
        <View style={{ flex: 1 }}>
          <ActionTile
            title="Insights"
            onPress={() => router.push(`/events/${id}/insights`)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ActionTile
            title="Export"
            onPress={() => router.push(`/events/${id}/export`)}
          />
        </View>
      </Row>

      <H2>Progress grid</H2>
      <P muted>Rows = interviewees, columns = 7 questions. Tap a row to interview.</P>

      {interviewees.length === 0 ? (
        <Empty text="No interviewees yet. Add one to start." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* header row */}
            <Row style={styles.headerRow}>
              <View style={styles.nameCol}>
                <Text style={styles.headerText}>Interviewee</Text>
              </View>
              {questions.map((q) => (
                <View key={q.id} style={styles.cellHead}>
                  <Text style={styles.headerText}>Q{q.position}</Text>
                </View>
              ))}
            </Row>
            {interviewees.map((iv) => (
              <Pressable
                key={iv.id}
                onPress={() => router.push(`/interviewee/${iv.id}`)}
              >
                <Row style={styles.gridRow}>
                  <View style={styles.nameCol}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {iv.name}
                    </Text>
                  </View>
                  {questions.map((q) => {
                    const a = answers.get(`${iv.id}:${q.id}`);
                    return (
                      <View
                        key={q.id}
                        style={[styles.cell, { backgroundColor: cellColor(a) }]}
                      />
                    );
                  })}
                </Row>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      <Row style={{ flexWrap: 'wrap', gap: spacing(3) }}>
        <Legend color={colors.surfaceAlt} label="Empty" />
        <Legend color={colors.warning} label="Recorded" />
        <Legend color={colors.success} label="Uploaded" />
        <Legend color={colors.danger} label="Upload failed" />
      </Row>

      {event.status !== 'finalised' ? (
        <Button title="Finalise event" variant="secondary" onPress={finalise} />
      ) : (
        <Card>
          <P>This event is finalised.</P>
        </Card>
      )}
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Row>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </Row>
  );
}

const CELL = 34;
const styles = StyleSheet.create({
  headerRow: { marginBottom: spacing(1) },
  gridRow: { marginBottom: spacing(1) },
  nameCol: { width: 120, justifyContent: 'center', paddingRight: spacing(2) },
  nameText: { color: colors.text, fontSize: 13 },
  headerText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  cellHead: { width: CELL, alignItems: 'center' },
  cell: {
    width: CELL - 4,
    height: CELL - 4,
    marginHorizontal: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
});
