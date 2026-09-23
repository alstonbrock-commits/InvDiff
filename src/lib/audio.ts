// Take-file housekeeping shared by both recording paths.
//
// moveToRecordings: takes land in OS-purgeable cache dirs (the speech
// recognizer's cache, expo-av's recording dir) — move them into
// documentDirectory/recordings, the one place the offline queue and the
// 7-day localAudioSweep both know about.
//
// compressTake: the live-caption path persists uncompressed 16 kHz PCM wav
// (~1.9 MB/min). Compress speech ~4x before upload — less mobile data in the
// field, less egress on the server. The compressor is a native module
// (react-native-compressor, dev build only); ANY failure falls back to the
// original wav — a bigger upload is always better than a lost take.
import * as FileSystem from 'expo-file-system/legacy';

const KNOWN_EXT = /\.(wav|mp3|m4a|aac)$/;

export async function moveToRecordings(uri: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}recordings`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
      () => {},
    );
    const dest = `${dir}/${uri.split('/').pop()}`;
    await FileSystem.moveAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri; // fall back to the original path rather than losing the take
  }
}

export async function compressTake(uri: string): Promise<string> {
  if (!uri.toLowerCase().endsWith('.wav')) return uri; // already compressed
  try {
    const { Audio } = await import('react-native-compressor');
    // 64 kbps is the library's floor; fine for 16 kHz mono speech.
    const out: string = await Audio.compress(uri, { bitrate: 64000 });
    if (!out || !KNOWN_EXT.test(out.toLowerCase())) return uri;

    const [src, dst] = await Promise.all([
      FileSystem.getInfoAsync(uri),
      FileSystem.getInfoAsync(out),
    ]);
    // Only adopt a result that exists and actually saved space.
    if (!dst.exists || dst.size === 0 || (src.exists && dst.size >= src.size)) {
      return uri;
    }

    // Park the compressed file where the wav was (same name, new extension),
    // then drop the wav.
    const ext = out.slice(out.lastIndexOf('.'));
    const dest = uri.replace(/\.wav$/i, ext);
    await FileSystem.moveAsync({ from: out, to: dest });
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    return dest;
  } catch {
    return uri; // compressor missing (Expo Go) or failed — upload the wav
  }
}
