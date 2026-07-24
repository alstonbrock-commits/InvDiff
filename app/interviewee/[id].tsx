import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Card, Empty, H1, H2, P, Screen } from '@/components/ui';
import { SyncBanner } from '@/components/SyncBanner';
import { Recorder } from '@/components/Recorder';
import { ConsentCapture } from '@/components/ConsentCapture';
import {
  getInterviewee,
  hasConsent,
  listQuestions,
} from '@/lib/db/queries';
import { getSettings } from '@/lib/remote';
import type { IntervieweeRow, QuestionRow } from '@/lib/types';
import { DEFAULT_QUESTIONS } from '@/lib/db/queries';

export default function IntervieweeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [interviewee, setInterviewee] = useState<IntervieweeRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [consented, setConsented] = useState(false);
  const [settings, setSettings] = useState({
    consent_text:
      'PLACEHOLDER CONSENT TEXT — replace before production. Includes the cross-border disclosure: audio and transcripts are processed by AI providers outside Australia (United States).',
    consent_text_version: 'v1',
  });

  const load = useCallback(async () => {
    if (!id) return;
    const iv = await getInterviewee(id);
    setInterviewee(iv);
    if (iv) setQuestions(await listQuestions(iv.event_id));
    setConsented(await hasConsent(id));
  }, [id]);

  useEffect(() => {
    // Consent text/version come from server settings when online; fall back to
    // sensible defaults offline.
    getSettings()
      .then((s) =>
        setSettings({
          consent_text: s.consent_text,
          consent_text_version: s.consent_text_version,
        }),
      )
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!interviewee) return <Screen><P>Loading…</P></Screen>;

  return (
    <Screen>
      <SyncBanner />
      <H1>{interviewee.name}</H1>
      {interviewee.role_or_segment ? (
        <P muted>{interviewee.role_or_segment}</P>
      ) : null}

      {!consented ? (
        <ConsentCapture
          eventId={interviewee.event_id}
          intervieweeId={interviewee.id}
          consentText={settings.consent_text}
          consentTextVersion={settings.consent_text_version}
          onDone={() => setConsented(true)}
        />
      ) : (
        <>
          <Card>
            <P>✓ Consent captured. You can now record answers.</P>
          </Card>
          <H2>Questions</H2>
          {questions.length === 0 ? (
            <Empty text="No questions found for this event." />
          ) : (
            questions.map((q) => (
              <Recorder
                key={q.id}
                eventId={interviewee.event_id}
                intervieweeId={interviewee.id}
                questionId={q.id}
                position={q.position}
                text={q.text || DEFAULT_QUESTIONS[q.position - 1] || ''}
              />
            ))
          )}
        </>
      )}
    </Screen>
  );
}
