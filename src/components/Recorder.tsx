import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Badge, Button, Row } from './ui';
import { colors, spacing } from '@/lib/theme';
import { saveRecordedAnswer, getAnswer } from '@/lib/db/queries';
import type { AnswerRow } from '@/lib/types';
import { runSync } from '@/lib/sync/SyncProvider';

// Low-bitrate mono AAC — good for speech, cheap to upload and transcribe.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

interface Props {
  eventId: string;
  intervieweeId: string;
  questionId: string;
  position: number;
  text: string;
  disabled?: boolean;
}

export function Recorder({
  eventId,
  intervieweeId,
  questionId,
  position,
  text,
  disabled,
}: Props) {
  const [answer, setAnswer] = useState<AnswerRow | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const refresh = async () =>
    setAnswer(await getAnswer(intervieweeId, questionId));

  useEffect(() => {
    void refresh();
    return () => {
      sound?.unloadAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervieweeId, questionId]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function start() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission is required to record.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(RECORDING_OPTIONS);
      await rec.startAsync();
      setElapsed(0);
      setRecording(rec);
    } catch (e) {
      Alert.alert('Could not start recording', String(e));
    }
  }

  async function stop() {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const status = await recording.getStatusAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;

      // Copy to a stable location under documentDirectory (cache can be purged).
      const dir = `${FileSystem.documentDirectory}audio`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
        () => {},
      );
      const dest = `${dir}/${intervieweeId}_${questionId}.m4a`;
      await FileSystem.copyAsync({ from: uri, to: dest });

      await saveRecordedAnswer({
        intervieweeId,
        questionId,
        localUri: dest,
        durationMs: status.durationMillis ?? elapsed * 1000,
        eventId,
      });
      await refresh();
      void runSync(); // upload when online
    } catch (e) {
      Alert.alert('Could not save recording', String(e));
    }
  }

  async function play() {
    if (!answer?.local_audio_uri) return;
    try {
      const { sound: s } = await Audio.Sound.createAsync({
        uri: answer.local_audio_uri,
      });
      setSound(s);
      await s.playAsync();
    } catch {
      Alert.alert('Playback unavailable', 'The local audio may have been uploaded and cleared.');
    }
  }

  const recorded = !!answer?.recorded_at;

  return (
    <View style={styles.card}>
      <Text style={styles.q}>
        Q{position}. {text}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          {recording ? (
            <Button title={`Stop (${elapsed}s)`} variant="danger" onPress={stop} />
          ) : (
            <Button
              title={recorded ? 'Re-record' : 'Record'}
              onPress={start}
              disabled={disabled}
            />
          )}
          {recorded && answer?.local_audio_uri ? (
            <Button title="Play" variant="ghost" onPress={play} />
          ) : null}
        </Row>
        {recorded ? (
          <Badge
            text={answer?.upload_status ?? 'recorded'}
            color={
              answer?.upload_status === 'uploaded'
                ? colors.success
                : answer?.upload_status === 'failed'
                  ? colors.danger
                  : colors.warning
            }
          />
        ) : (
          <Badge text="empty" />
        )}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing(2),
  },
  q: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
