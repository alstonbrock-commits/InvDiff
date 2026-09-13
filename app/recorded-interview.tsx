import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';
import { Eyebrow, alertDialog } from '@/components';
import { useFocusData } from '@/lib/hooks';
import {
  displayRef,
  getInterviewee,
  listAnswersForInterviewee,
  listInterviewees,
  listQuestions,
  saveRecordedAnswer,
} from '@/lib/db/queries';
import {
  liveCaptionsAvailable,
  startCaptionSession,
  type CaptionSession,
} from '@/lib/liveCaptions';
import { moveToRecordings } from '@/lib/audio';
import { runSync } from '@/lib/sync/SyncProvider';

// 16 kHz mono AAC — ideal input for Parakeet ASR and cheap to upload/store.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function RecordedInterview() {
  // The phone must never sleep mid-interview — idle sleep kills the mic on
  // both recording paths (expo-av and the live-caption session). Screen-scoped
  // on purpose: the interviewer is reading questions between takes too.
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, intervieweeId } = useLocalSearchParams<{
    eventId: string;
    intervieweeId: string;
  }>();

  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captionsSupported, setCaptionsSupported] = useState(false);
  const [caption, setCaption] = useState('');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const captionSessionRef = useRef<CaptionSession | null>(null);
  const captionScrollRef = useRef<ScrollView>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    void liveCaptionsAvailable().then(setCaptionsSupported);
  }, []);

  const { data, reload } = useFocusData(
    async () => {
      if (!eventId || !intervieweeId) return null;
      const [questions, answers, person, people] = await Promise.all([
        listQuestions(eventId),
        listAnswersForInterviewee(intervieweeId),
        getInterviewee(intervieweeId),
        listInterviewees(eventId),
      ]);
      const answered = new Set(
        answers.filter((a) => a.recorded_at).map((a) => a.event_question_id),
      );
      const ordinal = people.findIndex((p) => p.id === intervieweeId) + 1;
      return { questions, answered, person, ordinal, total: people.length };
    },
    [eventId, intervieweeId],
  );

  const questions = data?.questions ?? [];
  const answeredCount = data
    ? questions.filter((q) => data.answered.has(q.id)).length
    : 0;

  // Land on the first unanswered question once data arrives.
  useEffect(() => {
    if (data && questionIndex === null) {
      const firstOpen = questions.findIndex((q) => !data.answered.has(q.id));
      setQuestionIndex(firstOpen === -1 ? 0 : firstOpen);
    }
  }, [data, questionIndex, questions]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    elapsedRef.current = 0;
    const t = setInterval(() => {
      setElapsed((e) => {
        elapsedRef.current = e + 1;
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Discard a live take if the screen unmounts mid-recording.
  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      captionSessionRef.current?.cancel();
    };
  }, []);

  const currentQuestion = questionIndex !== null ? questions[questionIndex] : null;

  const startRecording = async () => {
    try {
      setCaption('');
      if (captionsSupported) {
        // One mic session: live captions + persisted wav (see liveCaptions.ts).
        captionSessionRef.current = await startCaptionSession({
          onPartial: setCaption,
          onError: (message) => setCaption(`(captions unavailable: ${message})`),
        });
        setRecording(true);
        return;
      }

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        alertDialog('Microphone needed', 'Microphone permission is required to record.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recordingRef.current = rec;
      setRecording(true);
    } catch (e) {
      alertDialog('Could not start recording', String(e));
    }
  };

  const saveTake = async (uri: string, durationMs: number) => {
    if (!currentQuestion || !eventId || !intervieweeId) return;
    await saveRecordedAnswer({
      intervieweeId,
      questionId: currentQuestion.id,
      localUri: uri,
      durationMs,
      eventId,
    });
    void runSync();
    reload();
    setCaption('');
    // Auto-advance to the next question; on the last, hand over to review.
    if (questionIndex !== null && questionIndex < questions.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      router.replace({
        pathname: '/approve-transcript',
        params: { eventId: eventId, intervieweeId: intervieweeId },
      });
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    try {
      // Captions path
      const session = captionSessionRef.current;
      if (session) {
        captionSessionRef.current = null;
        const { uri } = await session.stop();
        if (!uri) throw new Error('No recording file produced.');
        await saveTake(uri, elapsedRef.current * 1000);
        return;
      }

      // expo-av fallback path
      const rec = recordingRef.current;
      if (!rec) return;
      recordingRef.current = null;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const status = await rec.getStatusAsync();
      if (!uri) throw new Error('No recording file produced.');
      // expo-av records into an OS-purgeable cache dir — move the take into
      // recordings/ so the offline queue and the 7-day sweep both own it.
      const kept = await moveToRecordings(uri);
      await saveTake(kept, status.durationMillis ?? elapsedRef.current * 1000);
    } catch (e) {
      alertDialog('Could not save the recording', String(e));
    }
  };

  const goNext = () => {
    if (recording) return;
    if (questionIndex !== null && questionIndex < questions.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      router.replace({
        pathname: '/approve-transcript',
        params: { eventId: eventId!, intervieweeId: intervieweeId! },
      });
    }
  };

  const goBack = () => {
    if (recording) return;
    if (questionIndex !== null && questionIndex > 0) setQuestionIndex(questionIndex - 1);
    else router.back();
  };

  const headerRef = data?.person
    ? `${eventId ? displayRef(eventId) : ''} · Interview ${data.ordinal} of ${data.total}`
    : '';
  const isAnswered = currentQuestion ? data?.answered.has(currentQuestion.id) : false;

  return (
    <View style={{ flex: 1, backgroundColor: '#17262D' }}>
      {/* Top meta */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 44),
          paddingHorizontal: 20,
          paddingBottom: 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'IBMPlexMono-400',
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: '#7FC4D6',
            }}
          >
            {headerRef}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {recording && (
              <View
                style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#E4772A' }}
              />
            )}
            <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 11, color: '#E4772A' }}>
              {recording ? `REC ${mmss(elapsed)}` : 'READY'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, paddingTop: 22, paddingHorizontal: 22 }}>
        {/* Progress ticks — one per question, filled when answered */}
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 22 }}>
          {questions.map((q) => (
            <View
              key={q.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: data?.answered.has(q.id) ? '#E4772A' : '#33474F',
              }}
            />
          ))}
        </View>

        <Text
          style={{
            fontFamily: 'IBMPlexMono-400',
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#8A9499',
          }}
        >
          {currentQuestion
            ? `Question ${currentQuestion.position} of ${questions.length}`
            : ' '}
        </Text>

        <Text
          style={{
            fontFamily: 'Archivo-700',
            fontSize: 25,
            lineHeight: 31.25,
            letterSpacing: -0.5,
            color: '#FFFFFF',
            marginTop: 12,
          }}
        >
          {currentQuestion?.text ?? ''}
        </Text>

        {/* Live transcript fills the stage while recording with captions —
            large scrolling text in the theme's pale blue. Captions are a
            preview — Parakeet's transcript replaces them after sync. */}
        {recording && captionsSupported ? (
          <View style={{ flex: 1, marginTop: 26, marginBottom: 16 }}>
            <Eyebrow color="#7FC4D6" style={{ marginBottom: 10 }}>
              Live transcript
            </Eyebrow>
            <ScrollView
              ref={captionScrollRef}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                captionScrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 18,
                  lineHeight: 28,
                  color: '#7FC4D6',
                  paddingBottom: 14,
                }}
              >
                {caption || 'Listening…'}
              </Text>
            </ScrollView>
          </View>
        ) : (
          <View
            style={{
              marginTop: 26,
              backgroundColor: '#1F323B',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Eyebrow color="#7FC4D6" style={{ marginBottom: 8 }}>
              {recording ? 'Recording' : 'Transcript'}
            </Eyebrow>
            <Text
              numberOfLines={4}
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#C6D4D9',
              }}
            >
              {recording
                ? 'Recording this answer — tap the stop button when the interviewee has finished.'
                : isAnswered
                  ? 'Answer recorded. The final transcript is generated after this interview syncs.'
                  : captionsSupported
                    ? 'Tap the record button and ask the question aloud — a live transcript will appear here.'
                    : 'Tap the record button and ask the question aloud. The transcript is generated after sync.'}
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View
        style={{
          paddingHorizontal: 22,
          paddingBottom: 28 + insets.bottom,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={goBack} hitSlop={12} disabled={!!recording}>
          <Text
            style={{
              fontFamily: 'PublicSans-600',
              fontSize: 13,
              color: recording ? '#3A474D' : '#8A9499',
              width: 64,
            }}
          >
            Back
          </Text>
        </Pressable>

        <Pressable onPress={() => void (recording ? stopRecording() : startRecording())}>
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              borderWidth: 3,
              borderColor: 'rgba(228,119,42,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                // Recording → stop square; idle → record dot.
                borderRadius: recording ? 5 : 12,
                backgroundColor: '#E4772A',
              }}
            />
          </View>
        </Pressable>

        <Pressable onPress={goNext} hitSlop={12} disabled={!!recording}>
          <Text
            style={{
              fontFamily: 'PublicSans-700',
              fontSize: 13,
              color: recording ? '#3A474D' : '#E4772A',
              width: 64,
              textAlign: 'right',
            }}
          >
            Next
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
