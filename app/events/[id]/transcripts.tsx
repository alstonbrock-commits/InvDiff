import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Empty, H1, P, Row, Screen } from '@/components/ui';
import {
  bulkApprove,
  fetchEventTranscripts,
  getSettings,
  TranscriptDetail,
} from '@/lib/remote';
import { colors, scoreColor } from '@/lib/theme';

const STATUS_ORDER: Record<string, number> = {
  rejected: 0,
  done: 1,
  processing: 2,
  pending: 3,
  error: 4,
  approved: 5,
};

export default function EventTranscripts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<TranscriptDetail[]>([]);
  const [threshold, setThreshold] = useState(85);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const s = await getSettings();
      setThreshold(s.auto_approve_threshold);
      const rows = await fetchEventTranscripts(id);
      // unreviewed first, then worst audio-quality first
      rows.sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
          (a.quality_score ?? 0) - (b.quality_score ?? 0),
      );
      setList(rows);
    } catch (e) {
      Alert.alert('Could not load transcripts', String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const clean = list.filter(
    (t) => t.status === 'done' && (t.quality_score ?? 0) >= threshold && t.flagged_segment_count === 0,
  );
  const awaiting = list.filter((t) => t.status === 'done' || t.status === 'rejected').length;

  async function onBulk() {
    if (clean.length === 0) return;
    setBusy(true);
    try {
      await bulkApprove(clean.map((t) => t.id));
      await load();
    } catch (e) {
      Alert.alert('Bulk approve failed', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Review transcripts</H1>
      <P muted>
        {awaiting} awaiting review. Sorted worst-first by audio-quality score —
        which reflects clarity, not accuracy. Bulk-approve the clean ones, then
        hand-check anything flagged.
      </P>

      {clean.length > 0 ? (
        <Button
          title={`Approve ${clean.length} clean transcript(s) (score ≥ ${threshold}, 0 flags)`}
          onPress={onBulk}
          loading={busy}
        />
      ) : null}

      {loading ? (
        <P muted>Loading…</P>
      ) : list.length === 0 ? (
        <Empty text="No transcripts yet. Record answers and they'll appear here once transcribed." />
      ) : (
        list.map((t) => (
          <Card
            key={t.id}
            accent={t.status === 'approved' ? colors.success : t.status === 'rejected' ? colors.danger : colors.orange}
            onPress={() => router.push(`/transcript/${t.id}?eventId=${t.event_id}`)}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <P>
                {t.interviewee_name} · Q{t.question_position}
              </P>
              <Badge text={`${t.quality_score ?? '—'}`} color={scoreColor(t.quality_score)} />
            </Row>
            <Row>
              {t.status === 'approved' ? (
                <Badge text="approved" color={colors.success} soft />
              ) : t.status === 'rejected' ? (
                <Badge text="rejected" color={colors.danger} soft />
              ) : t.flagged_segment_count > 0 ? (
                <Badge text={`${t.flagged_segment_count} flagged`} color={colors.warning} soft />
              ) : (
                <Badge text="ready" color={colors.teal} soft />
              )}
            </Row>
          </Card>
        ))
      )}
      <View style={{ height: 24 }} />
    </Screen>
  );
}
