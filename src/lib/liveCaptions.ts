// Live captions during recording — Android-first.
//
// One mic session does both jobs: expo-speech-recognition streams interim
// results into the UI *and* persists the session audio to a .wav
// (recordingOptions.persist), which becomes the answer file for the normal
// Parakeet pipeline. Captions are a preview only — Parakeet's transcript stays
// authoritative and the caption text is discarded after the take.
//
// iOS persists .caf (rejected by Together's endpoint) so it stays on the
// expo-av fallback path, as does any Android device without recognition
// support (< 13, no speech service / language pack).
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { compressTake, moveToRecordings } from './audio';

let cachedAvailability: boolean | null = null;

export async function liveCaptionsAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  try {
    cachedAvailability =
      Platform.OS === 'android' &&
      typeof Platform.Version === 'number' &&
      Platform.Version >= 33 && // recording persist requires Android 13+
      ExpoSpeechRecognitionModule.isRecognitionAvailable() &&
      ExpoSpeechRecognitionModule.supportsRecording();
  } catch {
    // Module missing (e.g. running in Expo Go) or a service probe threw.
    cachedAvailability = false;
  }
  return cachedAvailability;
}

export interface CaptionSession {
  /** Stops recognition; resolves with the persisted wav once it's ready. */
  stop(): Promise<{ uri: string | null }>;
  /** Abandons the take — no file, no further callbacks. */
  cancel(): void;
}

interface StartOpts {
  /** Running caption text: finalized segments plus the current interim. */
  onPartial: (text: string) => void;
  onError?: (message: string) => void;
}

export async function startCaptionSession(opts: StartOpts): Promise<CaptionSession> {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission is required to record.');

  let finalized = '';
  let interim = '';
  let stopped = false;

  let resolveAudioUri: (uri: string | null) => void;
  const audioUriPromise = new Promise<string | null>((resolve) => {
    resolveAudioUri = resolve;
  });

  const subs = [
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      if (stopped) return;
      const transcript = event.results?.[0]?.transcript ?? '';
      if (event.isFinal) {
        finalized = `${finalized}${finalized ? ' ' : ''}${transcript}`.trim();
        interim = '';
      } else {
        interim = transcript;
      }
      opts.onPartial(`${finalized}${finalized && interim ? ' ' : ''}${interim}`);
    }),
    ExpoSpeechRecognitionModule.addListener('audioend', (event) => {
      resolveAudioUri(event.uri ?? null);
    }),
    ExpoSpeechRecognitionModule.addListener('error', (event) => {
      // "no-speech" etc. end the session; surface everything else.
      if (!stopped && event.error !== 'no-speech') {
        opts.onError?.(event.message || event.error);
      }
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => {
      // Recognition ended without audioend (e.g. service died) — unblock stop().
      resolveAudioUri(null);
    }),
  ];

  const cleanup = () => {
    for (const sub of subs) sub.remove();
  };

  ExpoSpeechRecognitionModule.start({
    lang: 'en-AU',
    interimResults: true,
    continuous: true,
    // Online recognition when reachable, on-device otherwise (Android decides;
    // offline needs the device's downloaded language pack).
    requiresOnDeviceRecognition: false,
    addsPunctuation: true,
    recordingOptions: {
      persist: true,
      outputFileName: `take_${Date.now()}.wav`,
    },
  });

  return {
    async stop() {
      if (stopped) return { uri: null };
      stopped = true;
      ExpoSpeechRecognitionModule.stop();

      // audioend carries the persisted file; guard with a timeout so a wedged
      // service can't hang the save flow.
      const uri = await Promise.race([
        audioUriPromise,
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      cleanup();
      if (!uri) return { uri: null };

      // The recognizer writes into its cache dir; move the take somewhere the
      // offline queue can rely on, then compress the wav for upload (falls
      // back to the wav itself if the compressor is unavailable or fails).
      const dest = await moveToRecordings(uri);
      return { uri: await compressTake(dest) };
    },
    cancel() {
      stopped = true;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // already stopped
      }
      cleanup();
    },
  };
}
