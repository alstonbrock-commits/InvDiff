import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, H1, H2, Input, P, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function Settings() {
  const [retention, setRetention] = useState('90');
  const [threshold, setThreshold] = useState('85');
  const [consentText, setConsentText] = useState('');
  const [consentVersion, setConsentVersion] = useState('v1');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .single();
    if (data) {
      setRetention(String(data.audio_retention_days));
      setThreshold(String(data.auto_approve_threshold));
      setConsentText(data.consent_text);
      setConsentVersion(data.consent_text_version);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({
          audio_retention_days: parseInt(retention, 10) || 90,
          auto_approve_threshold: parseInt(threshold, 10) || 85,
          consent_text: consentText,
          consent_text_version: consentVersion,
        })
        .eq('id', true);
      if (error) throw error;
      Alert.alert('Saved', 'Settings updated.');
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Settings</H1>

      <Card>
        <H2>Audio retention</H2>
        <P muted>
          Recordings auto-delete this many days after a transcript is approved.
        </P>
        <Input
          label="Retention (days)"
          value={retention}
          onChangeText={setRetention}
          keyboardType="number-pad"
        />
      </Card>

      <Card>
        <H2>Bulk-approve threshold</H2>
        <P muted>
          Transcripts scoring at or above this, with zero flagged segments, are
          eligible for one-tap bulk approval. Start conservative.
        </P>
        <Input
          label="Threshold (0–100)"
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="number-pad"
        />
      </Card>

      <Card>
        <H2>Consent text</H2>
        <P muted>
          Shown above the signature pad and version-stamped onto every consent
          record. MUST include the cross-border disclosure: audio and transcripts
          are processed by AI providers outside Australia (United States). Bump
          the version whenever you change the wording.
        </P>
        <Input label="Version tag" value={consentVersion} onChangeText={setConsentVersion} />
        <Input
          label="Consent text"
          value={consentText}
          onChangeText={setConsentText}
          multiline
          style={{ minHeight: 160 }}
        />
      </Card>

      <Button title="Save settings" onPress={save} loading={busy} />
    </Screen>
  );
}
