import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, H1, Input, P, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';

interface DefaultQuestion {
  position: number;
  text: string;
}

export default function Questions() {
  const [questions, setQuestions] = useState<DefaultQuestion[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('default_questions')
      .select('position, text')
      .order('position');
    setQuestions((data as DefaultQuestion[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save() {
    setBusy(true);
    try {
      for (const q of questions) {
        const { error } = await supabase
          .from('default_questions')
          .update({ text: q.text })
          .eq('position', q.position);
        if (error) throw error;
      }
      Alert.alert('Saved', 'Questions updated. New events will use them.');
    } catch (e) {
      Alert.alert('Could not save questions', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Questions</H1>
      <P muted>
        The seven questions every event uses. Fixed for facilitators — only you
        can edit them here. Changes apply to future events; past events keep the
        wording they were captured with.
      </P>
      {questions.map((q, i) => (
        <Card key={q.position}>
          <Input
            label={`Question ${q.position}`}
            value={q.text}
            onChangeText={(t) =>
              setQuestions((prev) => prev.map((x, xi) => (xi === i ? { ...x, text: t } : x)))
            }
            multiline
          />
        </Card>
      ))}
      <Button title="Save questions" onPress={save} loading={busy} />
    </Screen>
  );
}
