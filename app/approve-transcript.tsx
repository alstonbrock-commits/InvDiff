import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Text, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, Button, SuccessDialog, alertDialog, showDialog } from '@/components';
import { useEntitlement } from '@/lib/entitlement';
import { promptSubscribe } from '@/lib/paywallPrompt';
import { useFocusData, useKeyboardHeight } from '@/lib/hooks';
import {
  displayRef,
  getEvent,
  getInterviewee,
  listAnswersForEvent,
  listInterviewees,
  listQuestions,
} from '@/lib/db/queries';
import {
  approveTranscript,
  fetchEventTranscripts,
  saveTranscriptEdit,
  type TranscriptDetail,
} from '@/lib/remote';
import { isOfflineError, startInsightGeneration } from '@/lib/insightFlow';
import { callFunction } from '@/lib/supabase';

function TranscriptText({ detail }: { detail: TranscriptDetail }) {
  return (
    <Text
      style={{
        fontFamily: 'PublicSans-400',
        fontSize: 13,
        lineHeight: 19.5,
        color: '#3A474D',
      }}
    >
      {detail.edited_text ?? detail.text ?? ''}
    </Text>
  );
}

export default function ApproveTranscript() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, intervieweeId } = useLocalSearchParams<{
    eventId: string;
    intervieweeId: string;
  }>();
  const ent = useEntitlement();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const keyboardHeight = useKeyboardHeight();

  // Local capture state: how many answers exist and whether they've uploaded.
  const { data: local } = useFocusData(
    async () => {
      if (!eventId || !intervieweeId) return null;
      const [event, person, questions, answers, people] = await Promise.all([
        getEvent(eventId),
        getInterviewee(intervieweeId),
        listQuestions(eventId),
        listAnswersForEvent(eventId),
        listInterviewees(eventId),
      ]);
      const mine = answers.filter(
        (a) => a.interviewee_id === intervieweeId && a.recorded_at,
      );
      const ordinal = people.findIndex((p) => p.id === intervieweeId) + 1;
      const lastAt = mine
        .map((a) => a.recorded_at!)
        .sort()
        .at(-1);
      return {
        event,
        person,
        questions,
        people,
        allAnswers: answers,
        mineCount: mine.length,
        // The local file now outlives the upload (7-day fallback copy), so
        // "still uploading" is judged by status, not the pointer.
        pendingUploads: mine.filter((a) =>
          ['pending', 'failed', 'uploading'].includes(a.upload_status),
        ).length,
        ordinal,
        lastAt,
      };
    },
    [eventId, intervieweeId],
  );

  // This interviewee's answers, by id — transcripts are matched on answer_id,
  // not name, so editing a name (e.g. adding a second person to a joint
  // interview) can never orphan their transcripts.
  const myAnswerIds = useMemo(
    () =>
      new Set(
        (local?.allAnswers ?? [])
          .filter((a) => a.interviewee_id === intervieweeId)
          .map((a) => a.id),
      ),
    [local?.allAnswers, intervieweeId],
  );

  // Server transcripts for the whole event; this screen shows one interviewee.
  const transcriptsQuery = useQuery({
    queryKey: ['transcripts', eventId],
    queryFn: () => fetchEventTranscripts(eventId!),
    enabled: !!eventId,
    refetchInterval: (query) => {
      const rows = query.state.data;
      const expected = local?.mineCount ?? 0;
      const mine = (rows ?? []).filter((t) => myAnswerIds.has(t.answer_id));
      const settled = mine.filter((t) =>
        ['done', 'approved', 'error'].includes(t.status),
      );
      // Poll while transcription is still catching up to the recordings.
      return settled.length < expected ? 5000 : false;
    },
  });

  const mine = useMemo(() => {
    const rows = transcriptsQuery.data ?? [];
    return rows
      .filter((t) => myAnswerIds.has(t.answer_id))
      .sort((a, b) => a.question_position - b.question_position);
  }, [transcriptsQuery.data, myAnswerIds]);

  // Recovery: transcription is requested exactly once, right after the audio
  // uploads — if that call is lost (offline blip, or the answer row hadn't
  // reached the server yet), nothing asks again and this screen would wait
  // forever. While it polls, re-request transcription for uploaded answers
  // the server has no transcript row for. The function is idempotent, so a
  // duplicate request is harmless.
  const lastKickAt = useRef(0);
  useEffect(() => {
    const rows = transcriptsQuery.data;
    const answers = local?.allAnswers;
    if (!rows || !answers) return;
    const have = new Set(rows.map((t) => t.answer_id));
    const missing = answers.filter(
      (a) =>
        a.interviewee_id === intervieweeId &&
        a.upload_status === 'uploaded' &&
        !have.has(a.id),
    );
    if (missing.length === 0) return;
    const now = Date.now();
    if (now - lastKickAt.current < 15000) return;
    lastKickAt.current = now;
    for (const a of missing) {
      callFunction('transcribe', { answer_id: a.id }).catch((e) =>
        console.warn(`transcribe re-request failed for ${a.id}`, e),
      );
    }
  }, [transcriptsQuery.data, local?.allAnswers, intervieweeId]);

  const readyCount = mine.filter((t) => ['done', 'approved'].includes(t.status)).length;
  const expected = local?.mineCount ?? 0;
  const allReady = expected > 0 && readyCount >= expected;
  // Already signed off — the screen is now "review and correct", and the
  // action regenerates the insight from the corrected text.
  const allApproved =
    expected > 0 &&
    mine.filter((t) => t.status === 'approved').length >= expected;
  const finalised = local?.event?.status === 'finalised';
  const offline = transcriptsQuery.isError;

  const startEdit = (t: TranscriptDetail) => {
    setEditingId(t.id);
    setDraft(t.edited_text ?? t.text ?? '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await saveTranscriptEdit(editingId, draft);
      setEditingId(null);
      await transcriptsQuery.refetch();
    } catch (e) {
      alertDialog('Could not save the correction', String(e));
    }
  };

  const approveAll = async () => {
    if (busy || !eventId) return;
    // Approving leads straight into generation; once the free report is used
    // and there is no subscription, that path is locked.
    if (!ent.active) {
      promptSubscribe(router);
      return;
    }
    setBusy(true);
    try {
      for (const t of mine) {
        if (t.status === 'done') await approveTranscript(t.id);
      }

      // A finalised event is being corrected — the button already reads
      // "Regenerate insight", so the action is explicit. Regenerate directly.
      if (finalised) {
        await startInsightGeneration(eventId);
        setComplete(true);
        return;
      }

      const refreshed = await transcriptsQuery.refetch();
      const rows = refreshed.data ?? [];

      // Generation is user-driven: ask, never assume. Confirm = generate, so
      // the hardware back button (which fires cancel) can only mean "more
      // interviews", never "finalise the event".
      showDialog({
        variant: 'confirm',
        title: 'Transcripts approved',
        body: 'Are there more interviews to run for this event?',
        cancelLabel: 'More interviews',
        confirmLabel: 'No — generate insight',
        onCancel: () => router.back(),
        onConfirm: () => void generateGuarded(rows),
      });
    } catch (e) {
      // The approve path needs the network (Supabase writes). Offline this
      // surfaced as a raw FunctionsFetchError, which reads like a bug rather
      // than "no signal".
      if (isOfflineError(e)) {
        alertDialog(
          'No connection',
          'Approving needs internet. Your recordings and corrections are safe on this device — reconnect and tap Approve again.',
        );
      } else {
        alertDialog('Could not approve', String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  // Gates that must pass before the report is generated.
  const generateGuarded = async (rows: TranscriptDetail[]) => {
    if (!eventId) return;

    // Every recorded answer on the event needs an APPROVED transcript first —
    // the synthesis reads all transcript text regardless of status, so
    // unreviewed answers must never reach the report.
    const recordedTotal =
      local?.allAnswers.filter((a) => a.recorded_at).length ?? 0;
    const approvedTotal = rows.filter((t) => t.status === 'approved').length;
    if (approvedTotal < recordedTotal) {
      alertDialog(
        'Approve the other interviews first',
        'Some answers on this event are not approved yet. Tap each person on the roster to review and approve their transcript, then generate the insight.',
      );
      router.back();
      return;
    }

    // Roster members with unanswered questions: generating now leaves those
    // answers out — make that a decision, not a surprise. Someone with SOME
    // answers is described accurately (their recorded answers ARE included).
    const questionCount = local?.questions.length ?? 0;
    const answeredBy = (personId: string) =>
      local?.allAnswers.filter(
        (a) => a.interviewee_id === personId && a.recorded_at,
      ).length ?? 0;
    const outstanding = (local?.people ?? []).filter(
      (p) => answeredBy(p.id) < questionCount,
    );
    if (outstanding.length > 0) {
      const parts = outstanding.map((p) => {
        const n = answeredBy(p.id);
        return n === 0
          ? `${p.name} has not been interviewed`
          : `${p.name} has answered ${n} of ${questionCount} questions`;
      });
      showDialog({
        variant: 'confirm',
        title: 'Generate without everyone?',
        body: `${parts.join('; ')}. Unanswered questions won't be in the report. Generate anyway, or go back to finish the interviews first.`,
        cancelLabel: 'Go back',
        confirmLabel: 'Generate anyway',
        onCancel: () => router.back(),
        onConfirm: () => void generateNow(),
      });
      return;
    }

    await generateNow();
  };

  const generateNow = async () => {
    if (!eventId) return;
    setBusy(true);
    try {
      await startInsightGeneration(eventId);
      setComplete(true);
    } catch (e) {
      if (isOfflineError(e)) {
        alertDialog(
          'No connection',
          'Generating the insight needs internet. Reconnect and generate again from here or the roster.',
        );
      } else {
        alertDialog('Could not generate the insight', String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const subtitle = [
    eventId ? displayRef(eventId) : '',
    local ? `INTERVIEW ${local.ordinal}` : '',
    local?.lastAt
      ? new Date(local.lastAt).toLocaleTimeString('en-AU', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title="Approve transcript"
        subtitle={subtitle}
        titleSize={20}
        subtitleMarginTop={3}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 18,
          paddingBottom: 16 + keyboardHeight,
          gap: 10,
        }}
      >
        {mine.map((t) => (
          <React.Fragment key={t.id}>
            {/* Investigator card: the question asked */}
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E3DC',
                borderRadius: 12,
                padding: 13,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 5,
                }}
              >
                <Text style={{ fontFamily: 'PublicSans-700', fontSize: 11, color: '#2CA5C0' }}>
                  Investigator
                </Text>
                <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 9.5, color: '#8A9499' }}>
                  Q{t.question_position}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 13,
                  lineHeight: 19.5,
                  color: '#3A474D',
                }}
              >
                {t.question_text}
              </Text>
            </View>

            {/* Interviewee card: the transcribed answer */}
            <Pressable
              onPress={() => startEdit(t)}
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E3DC',
                borderRadius: 12,
                padding: 13,
                opacity: t.status === 'approved' ? 0.9 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 5,
                }}
              >
                <Text style={{ fontFamily: 'PublicSans-700', fontSize: 11, color: '#17262D' }}>
                  {t.interviewee_name}
                  {t.status === 'approved' ? ' · approved' : ''}
                </Text>
              </View>

              {editingId === t.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    autoFocus
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 13,
                      lineHeight: 19.5,
                      color: '#17262D',
                      backgroundColor: '#F6F5F1',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#E5E3DC',
                      padding: 10,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onPress={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button variant="primary" size="sm" fullWidth onPress={() => void saveEdit()}>
                        Save
                      </Button>
                    </View>
                  </View>
                </View>
              ) : t.status === 'error' ? (
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 13,
                    lineHeight: 19.5,
                    color: '#E4772A',
                  }}
                >
                  Transcription failed — it will retry on the next sync.
                </Text>
              ) : (
                <TranscriptText detail={t} />
              )}
            </Pressable>
          </React.Fragment>
        ))}

        {/* Placeholder rows for recordings the server hasn't transcribed yet */}
        {expected > mine.length &&
          Array.from({ length: expected - mine.length }).map((_, i) => (
            <View
              key={`pending-${i}`}
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E3DC',
                borderRadius: 12,
                padding: 13,
                opacity: 0.6,
              }}
            >
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 13,
                  color: '#8A9499',
                }}
              >
                Waiting for transcription…
              </Text>
            </View>
          ))}
      </ScrollView>

      {keyboardHeight === 0 && (
      <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
        {/* Status sits with the action, not at the top of a long scroll —
            this is the line that tells you the interview is ready to approve. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            backgroundColor: allReady ? 'rgba(44,165,192,0.12)' : '#EFEDE7',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: allReady ? '#2CA5C0' : '#8A9499',
            }}
          />
          <Text
            style={{
              fontFamily: allReady ? 'PublicSans-600' : 'PublicSans-400',
              fontSize: 11.5,
              lineHeight: 15.5,
              color: allReady ? '#17262D' : '#5D6B70',
              flex: 1,
            }}
          >
            {offline
              ? 'Transcripts appear once you are back online.'
              : allReady
                ? finalised
                  ? 'Tap any line to correct it, then regenerate the insight.'
                  : allApproved
                    ? 'Approved. Generate the insight once the interviews are done.'
                    : `Ready to approve — ${readyCount} of ${expected} transcribed. Tap any line to correct it first.`
                : local && local.pendingUploads > 0
                  ? `Uploading ${local.pendingUploads} recording${local.pendingUploads === 1 ? '' : 's'} — transcripts follow.`
                  : `Transcribing ${readyCount} of ${expected} — usually under a minute per answer.`}
          </Text>
        </View>
      </View>
      )}

      {keyboardHeight === 0 && (
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingTop: 10,
          paddingHorizontal: 18,
          paddingBottom: 22 + insets.bottom,
        }}
      >
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onPress={() => mine[0] && startEdit(mine.find((t) => t.status === 'done') ?? mine[0])}
          >
            Edit
          </Button>
        </View>
        <View style={{ flex: 1.4 }}>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            disabled={!allReady || busy}
            onPress={() => void approveAll()}
          >
            {busy
              ? finalised
                ? 'Regenerating…'
                : allApproved
                  ? 'Generating…'
                  : 'Approving…'
              : finalised
                ? 'Regenerate insight'
                : allApproved
                  ? 'Generate insight'
                  : 'Approve'}
          </Button>
        </View>
      </View>
      )}

      <SuccessDialog
        visible={complete}
        eyebrow={eventId ? displayRef(eventId) : undefined}
        title="Event complete"
        body="All transcripts approved — the insight is being generated. It will appear on the Insights tab in a few minutes."
        actionLabel="View insights"
        onAction={() => {
          setComplete(false);
          router.replace('/(tabs)/(insights)');
        }}
      />
    </View>
  );
}
