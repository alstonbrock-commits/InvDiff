import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Card, H1, Input, P, Screen } from '@/components/ui';
import { listQuestions, updateQuestionText } from '@/lib/db/queries';
import type { QuestionRow } from '@/lib/types';

export default function EditQuestions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const qs = await listQuestions(id);
    setQuestions(qs);
    setDrafts(Object.fromEntries(qs.map((q) => [q.id, q.text])));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveAll() {
    for (const q of questions) {
      const t = drafts[q.id];
      if (t !== undefined && t !== q.text) await updateQuestionText(q, t);
    }
    await load();
  }

  return (
    <Screen>
      <H1>Questions</H1>
      <P muted>
        These seven questions are asked of every interviewee. Placeholder wording
        ships by default — replace it with your finalised questions.
      </P>
      {questions.map((q) => (
        <Card key={q.id}>
          <Input
            label={`Question ${q.position}`}
            value={drafts[q.id] ?? ''}
            onChangeText={(t) => setDrafts((d) => ({ ...d, [q.id]: t }))}
            multiline
          />
        </Card>
      ))}
      <Button title="Save questions" onPress={saveAll} />
    </Screen>
  );
}
