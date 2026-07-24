import React, { useCallback, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Card, H1, H2, P, Row, Screen } from '@/components/ui';
import { getEvent } from '@/lib/db/queries';
import {
  fetchEventTranscripts,
  fetchInsights,
  hasTranscriptInclusiveExport,
  recordExport,
} from '@/lib/remote';
import { generateAndSharePdf } from '@/lib/pdf';
import { purgeEventAudio } from '@/lib/ai';
import type { EventRow } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [includeTranscripts, setIncludeTranscripts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id) setEvent(await getEvent(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function doExport(withTranscripts: boolean): Promise<boolean> {
    setBusy('export');
    try {
      const insights = await fetchInsights(id!);
      const transcripts = await fetchEventTranscripts(id!);
      const unapproved = transcripts.filter((t) => t.status !== 'approved').length;
      await generateAndSharePdf({
        eventTitle: event?.title ?? 'Event',
        generatedAt: new Date().toLocaleString(),
        insights,
        includeTranscripts: withTranscripts,
        transcripts,
        unapprovedCount: unapproved,
      });
      await recordExport(id!, null, withTranscripts);
      return true;
    } catch (e) {
      Alert.alert('Export failed', String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteRecordings() {
    if (event?.status !== 'finalised') {
      Alert.alert('Finalise the event first', 'Recordings can only be deleted after finalising.');
      return;
    }
    // Export-first safeguard: ensure a transcript-inclusive export exists so the
    // interview record survives the audio deletion.
    const hasExport = await hasTranscriptInclusiveExport(id!);
    if (!hasExport) {
      Alert.alert(
        'Preserve the record first',
        'Deleting recordings is permanent. There is no export that includes the full transcripts yet. Generate one now before deleting?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Export with transcripts',
            onPress: async () => {
              const ok = await doExport(true);
              if (ok) confirmDelete();
            },
          },
        ],
      );
      return;
    }
    confirmDelete();
  }

  function confirmDelete() {
    Alert.alert(
      'Delete all recordings?',
      'This permanently deletes every audio recording for this event. Transcripts and insights are kept. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete recordings',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              const r = await purgeEventAudio(id!);
              Alert.alert('Recordings deleted', `${r.purged} file(s) removed.`);
            } catch (e) {
              Alert.alert('Delete failed', String(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <H1>Export</H1>
      <Card>
        <H2>Event Insights summary (PDF)</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <P>Attach full transcripts as an appendix</P>
          <Switch
            value={includeTranscripts}
            onValueChange={setIncludeTranscripts}
            trackColor={{ true: colors.primary }}
          />
        </Row>
        <P muted>
          The summary always includes the insights, recommendations, and linked
          evidence quotes. Turn the toggle on to append every transcript in full.
        </P>
        <Button
          title="Generate & share PDF"
          onPress={() => doExport(includeTranscripts)}
          loading={busy === 'export'}
        />
      </Card>

      <Card style={{ borderColor: colors.border }}>
        <H2>Delete recordings</H2>
        <P muted>
          Once you&apos;re happy with the summary, you can delete the audio early
          instead of waiting for the automatic 90-day purge. Available on
          finalised events. Transcripts are kept; export them first.
        </P>
        <Button
          title="Delete recordings for this event"
          variant="danger"
          onPress={onDeleteRecordings}
          loading={busy === 'delete'}
        />
      </Card>
      <View style={{ height: spacing(6) }} />
    </Screen>
  );
}
