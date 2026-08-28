import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Button, Watermark, Wordmark } from '@/components';
import { useAuth } from '@/lib/auth';
import { ROUTES, useGate } from '@/lib/gate';

// ROOT-level, shown once per account after sign-up (and after the plan is in
// place) — a paged walkthrough of the workflow. Completion is recorded on the
// profile (profiles.onboarded_at) with a local mirror in case that write
// happens offline.

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'Step 1',
    title: 'Log an event',
    body: 'Start with what happened: a title, the site, when it occurred, and a few photos if you have them.',
    points: ['Works fully offline on site', 'Everything syncs when you are back in range'],
  },
  {
    eyebrow: 'Step 2',
    title: 'Add the people you will interview',
    body: 'Build the roster for the event. Interviewing two people together? Enter them as one joint entry.',
    points: ['Add or remove people at any time', 'Progress is tracked per person'],
  },
  {
    eyebrow: 'Step 3',
    title: 'Record the answers',
    body: 'Seven questions per person. Tap record, ask the question, tap stop — the audio stays on your device until it can upload.',
    points: ['Pause and resume mid-interview', 'The screen stays awake while recording'],
  },
  {
    eyebrow: 'Step 4',
    title: 'Review the transcripts',
    body: 'Each answer is transcribed automatically once it uploads. Fix anything that was misheard, then approve it.',
    points: ['Nothing reaches a report until you approve it', 'Edit any transcript later from the roster'],
  },
  {
    eyebrow: 'Step 5',
    title: 'Generate the insight report',
    body: 'When the interviews are approved, generate the report. It reads every transcript and writes a de-identified learning document.',
    points: ['Up to five insights and three recommendations', 'Share the PDF from the Insights tab'],
  },
];

const TEAM_SLIDE: Slide = {
  eyebrow: 'Your team',
  title: 'See your team’s work',
  body: 'As a supervisor, every event and report your team logs appears in your feed alongside your own — read-only, so their work stays theirs.',
  points: ['Invite and remove people from the Team tab', 'Team members only ever see their own events'],
};

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gate = useGate();
  const { profile, markOnboarded } = useAuth();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const slides = useMemo(
    () => (profile?.org_role === 'supervisor' ? [...SLIDES, TEAM_SLIDE] : SLIDES),
    [profile?.org_role],
  );

  if (gate.target && gate.target !== ROUTES.onboarding) return <Redirect href="/" />;

  const last = index === slides.length - 1;

  const goTo = (i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    await markOnboarded();
    // The gate now points at the app; the Redirect above takes over.
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#1B2B3A' }}>
      {/* Top bar */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 44),
          paddingHorizontal: 22,
          paddingBottom: 6,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Wordmark size="sm" surface="navy" />
        {!last && (
          <Pressable onPress={() => void finish()} hitSlop={10} disabled={finishing}>
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#7FC4D6' }}>
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View style={{ width, flex: 1, paddingHorizontal: 22, paddingTop: 18 }}>
            {/* Illustration block */}
            <View
              style={{
                backgroundColor: '#22333F',
                borderRadius: 18,
                height: 170,
                overflow: 'hidden',
                justifyContent: 'flex-end',
                padding: 18,
              }}
            >
              <Watermark top={-20} right={-30} size={190} />
              <Text
                style={{
                  fontFamily: 'Archivo-800',
                  fontSize: 64,
                  letterSpacing: -2,
                  color: '#E4772A',
                  lineHeight: 66,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </Text>
            </View>

            <Text
              style={{
                fontFamily: 'IBMPlexMono-400',
                fontSize: 9.5,
                letterSpacing: 1.9,
                textTransform: 'uppercase',
                color: '#7FC4D6',
                marginTop: 22,
              }}
            >
              {item.eyebrow}
            </Text>
            <Text
              style={{
                fontFamily: 'Archivo-800',
                fontSize: 26,
                lineHeight: 31,
                letterSpacing: -0.52,
                color: '#FFFFFF',
                marginTop: 8,
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 14.5,
                lineHeight: 21.5,
                color: '#C9D3D7',
                marginTop: 10,
              }}
            >
              {item.body}
            </Text>
            <View style={{ marginTop: 14, gap: 8 }}>
              {item.points.map((p) => (
                <View key={p} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#2CA5C0',
                      marginTop: 7,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: 'PublicSans-500',
                      fontSize: 13,
                      lineHeight: 19,
                      color: '#E8EEF0',
                      flex: 1,
                    }}
                  >
                    {p}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      />

      {/* Dots + actions */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 22 + insets.bottom, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {slides.map((s, i) => (
            <Pressable key={s.title} onPress={() => goTo(i)} hitSlop={6}>
              <View
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === index ? '#E4772A' : '#3F525C',
                }}
              />
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {index > 0 && !last && (
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={() => goTo(index - 1)}
                style={{
                  borderWidth: 1.5,
                  borderColor: '#3F525C',
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Archivo-700', fontSize: 14, color: '#E8EEF0' }}>
                  Back
                </Text>
              </Pressable>
            </View>
          )}
          <View style={{ flex: 2 }}>
            <Button
              variant="primary"
              fullWidth
              disabled={finishing}
              onPress={() => (last ? void finish() : goTo(index + 1))}
            >
              {last ? (finishing ? 'Opening…' : 'Get started') : 'Next'}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
