import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import SignatureScreen, {
  SignatureViewRef,
} from 'react-native-signature-canvas';
import * as FileSystem from 'expo-file-system';
import { Button, Card, H2, Input, P } from './ui';
import { colors, spacing } from '@/lib/theme';
import { saveConsent } from '@/lib/db/queries';
import { runSync } from '@/lib/sync/SyncProvider';

interface Props {
  eventId: string;
  intervieweeId: string;
  consentText: string;
  consentTextVersion: string;
  onDone: () => void;
}

export function ConsentCapture({
  eventId,
  intervieweeId,
  consentText,
  consentTextVersion,
  onDone,
}: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const [signedName, setSignedName] = useState('');
  const [saving, setSaving] = useState(false);

  // Called with the signature as a data URL when the user confirms.
  async function handleOK(dataUrl: string) {
    try {
      setSaving(true);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const dir = `${FileSystem.documentDirectory}signatures`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
        () => {},
      );
      const uri = `${dir}/${intervieweeId}.png`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await saveConsent({
        intervieweeId,
        eventId,
        signatureLocalUri: uri,
        consentTextVersion,
        signedByName: signedName.trim(),
      });
      void runSync();
      onDone();
    } catch (e) {
      Alert.alert('Could not save consent', String(e));
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!signedName.trim()) {
      Alert.alert('Please type the interviewee’s name before signing.');
      return;
    }
    ref.current?.readSignature();
  }

  return (
    <Card>
      <H2>Consent required</H2>
      <View style={styles.consentBox}>
        <P>{consentText}</P>
      </View>
      <P muted>Consent version: {consentTextVersion}</P>

      <Input
        label="Interviewee name (as consenting)"
        value={signedName}
        onChangeText={setSignedName}
        placeholder="Full name"
      />

      <Text style={styles.label}>Signature</Text>
      <View style={styles.canvasWrap}>
        <SignatureScreen
          ref={ref}
          onOK={handleOK}
          webStyle={canvasStyle}
          autoClear={false}
          descriptionText=""
        />
      </View>

      <Button
        title="Clear signature"
        variant="ghost"
        onPress={() => ref.current?.clearSignature()}
      />
      <Button
        title="Save consent & continue"
        onPress={submit}
        loading={saving}
      />
    </Card>
  );
}

const canvasStyle = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body,html { background-color: #E2E8F0; }
`;

const styles = StyleSheet.create({
  consentBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textMuted, fontSize: 13 },
  canvasWrap: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
