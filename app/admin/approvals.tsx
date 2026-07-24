import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Button, Card, Empty, H1, P, Row, Screen } from '@/components/ui';
import {
  bulkApprove,
  fetchApprovalQueue,
  getSettings,
  TranscriptDetail,
} from '@/lib/remote';
import { colors, scoreColor } from '@/lib/theme';

export default function Approvals() {
  const router = useRouter();
  const [queue, setQueue] = useState<TranscriptDetail[]>([]);
  const [threshold, setThreshold] = useState(85);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setThreshold(s.auto_approve_threshold);
      setQueue(await fetchApprovalQueue());
    } catch (e) {
      Alert.alert('Could not load queue', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // "Clean" = only-status done, score >= threshold, zero flagged segments.
  const clean = queue.filter(
    (t) =>
      t.status === 'done' &&
      (t.quality_score ?? 0) >= threshold &&
      t.flagged_segment_count === 0,
  );

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
      <H1>Approval queue</H1>
      <P muted>
        Sorted worst-first by audio-quality score. Bulk-approve the clean
        majority, then hand-review the flagged ones. The score measures clarity,
        not correctness.
      </P>

      {clean.length > 0 ? (
        <Button
          title={`Bulk-approve ${clean.length} clean transcript(s) (score ≥ ${threshold}, 0 flags)`}
          onPress={onBulk}
          loading={busy}
        />
      ) : null}

      {loading ? (
        <P muted>Loading…</P>
      ) : queue.length === 0 ? (
        <Empty text="Nothing awaiting approval." />
      ) : (
        queue.map((t) => (
          <Card
            key={t.id}
            onPress={() =>
              router.push(`/transcript/${t.id}?eventId=${t.event_id}`)
            }
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <P>
                {t.interviewee_name} · Q{t.question_position}
              </P>
              <Badge
                text={`${t.quality_score ?? '—'}`}
                color={scoreColor(t.quality_score)}
              />
            </Row>
            <P muted>{t.event_title}</P>
            <Row>
              {t.flagged_segment_count > 0 ? (
                <Badge
                  text={`${t.flagged_segment_count} flagged`}
                  color={colors.warning}
                />
              ) : (
                <Badge text="no flags" color={colors.success} />
              )}
              {t.status === 'rejected' ? (
                <Badge text="rejected" color={colors.danger} />
              ) : null}
            </Row>
          </Card>
        ))
      )}
      <View style={{ height: 24 }} />
    </Screen>
  );
}
