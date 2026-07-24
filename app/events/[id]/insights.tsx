import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { generateInsights, generateRecommendations } from '@/lib/ai';
import {
  fetchEventTranscripts,
  fetchInsights,
  finaliseInsights,
  InsightWithChildren,
  updateInsight,
  updateRecommendation,
} from '@/lib/remote';
import { colors, spacing } from '@/lib/theme';

export default function InsightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [insights, setInsights] = useState<InsightWithChildren[]>([]);
  const [unapproved, setUnapproved] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setInsights(await fetchInsights(id));
    const ts = await fetchEventTranscripts(id);
    setUnapproved(ts.filter((t) => t.status !== 'approved').length);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onGenerate() {
    setBusy('gen');
    try {
      const r = await generateInsights(id!);
      await generateRecommendations(id!);
      await load();
      Alert.alert('Insights generated', `${r.count} insight(s) created.`);
    } catch (e) {
      Alert.alert('Generation failed', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onFinalise() {
    setBusy('final');
    try {
      await finaliseInsights(id!);
      await load();
    } catch (e) {
      Alert.alert('Could not finalise', String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <H1>Insights</H1>

      {unapproved > 0 ? (
        <Card style={{ borderColor: colors.warning }}>
          <P>
            ⚠ {unapproved} transcript(s) in this event are not yet approved.
            Insights generated now may reason over unreviewed text.
          </P>
        </Card>
      ) : null}

      <Row>
        <View style={{ flex: 1 }}>
          <Button
            title={insights.length ? 'Regenerate' : 'Generate insights'}
            onPress={onGenerate}
            loading={busy === 'gen'}
          />
        </View>
        {insights.length > 0 ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Finalise"
              variant="secondary"
              onPress={onFinalise}
              loading={busy === 'final'}
            />
          </View>
        ) : null}
      </Row>

      {insights.length === 0 ? (
        <Empty text="No insights yet. Generate to draft up to 5 evidence-linked insights." />
      ) : (
        insights.map((ins) => (
          <InsightCard key={ins.id} insight={ins} onChanged={load} />
        ))
      )}
    </Screen>
  );
}

function InsightCard({
  insight,
  onChanged,
}: {
  insight: InsightWithChildren;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(insight.title);
  const [body, setBody] = useState(insight.body);
  const [editing, setEditing] = useState(false);

  async function save() {
    await updateInsight(insight.id, { title, body });
    setEditing(false);
    onChanged();
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge text={`Insight ${insight.position}`} color={colors.primary} />
        <Badge
          text={insight.status}
          color={insight.status === 'final' ? colors.success : colors.textMuted}
        />
      </Row>

      {editing ? (
        <>
          <Input label="Title" value={title} onChangeText={setTitle} />
          <Input label="Body" value={body} onChangeText={setBody} multiline style={{ minHeight: 100 }} />
          <Button title="Save" onPress={save} />
        </>
      ) : (
        <>
          <H2>{insight.title}</H2>
          <P>{insight.body}</P>
          <Button title="Edit" variant="ghost" onPress={() => setEditing(true)} />
        </>
      )}

      {insight.recommendations.length > 0 ? (
        <View style={{ gap: spacing(1) }}>
          <P muted>Recommendations</P>
          {insight.recommendations.map((r) => (
            <RecRow key={r.id} id={r.id} body={r.body} onChanged={onChanged} />
          ))}
        </View>
      ) : null}

      {insight.evidence.length > 0 ? (
        <View style={{ gap: spacing(1) }}>
          <P muted>Evidence</P>
          {insight.evidence.map((e) => (
            <View key={e.id} style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: spacing(2) }}>
              <P>“{e.quote}”</P>
            </View>
          ))}
        </View>
      ) : (
        <P muted>No evidence linked.</P>
      )}
    </Card>
  );
}

function RecRow({
  id,
  body,
  onChanged,
}: {
  id: string;
  body: string;
  onChanged: () => void;
}) {
  const [text, setText] = useState(body);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <Row style={{ justifyContent: 'space-between' }}>
        <P>• {body}</P>
        <Button title="Edit" variant="ghost" onPress={() => setEditing(true)} />
      </Row>
    );
  }
  return (
    <View>
      <Input value={text} onChangeText={setText} multiline />
      <Button
        title="Save"
        onPress={async () => {
          await updateRecommendation(id, text);
          setEditing(false);
          onChanged();
        }}
      />
    </View>
  );
}
