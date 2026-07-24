import React, { useCallback, useState } from 'react';
import { Alert, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Button, Card, H1, H2, Input, P, Row, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

function csv(s: unknown): string {
  return '"' + String(s ?? '').replace(/"/g, '""') + '"';
}

export default function Settings() {
  const [retention, setRetention] = useState('90');
  const [threshold, setThreshold] = useState('85');
  const [consentText, setConsentText] = useState('');
  const [consentVersion, setConsentVersion] = useState('v1');
  const [adminEmail, setAdminEmail] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').single();
    if (data) {
      setRetention(String(data.audio_retention_days));
      setThreshold(String(data.auto_approve_threshold));
      setConsentText(data.consent_text);
      setConsentVersion(data.consent_text_version);
      setAdminEmail(data.admin_email ?? '');
      setEmailNotifications(data.email_notifications ?? true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveSettings() {
    setBusy('settings');
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({
          audio_retention_days: parseInt(retention, 10) || 90,
          auto_approve_threshold: parseInt(threshold, 10) || 85,
          consent_text: consentText,
          consent_text_version: consentVersion,
          admin_email: adminEmail.trim() || null,
          email_notifications: emailNotifications,
        })
        .eq('id', true);
      if (error) throw error;
      Alert.alert('Saved', 'Settings updated.');
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setBusy(null);
    }
  }

  // Export a CSV of report data across all events (one row per insight).
  async function exportData() {
    setBusy('export');
    try {
      const { data: events } = await supabase
        .from('events')
        .select('id, title, status, created_at, profiles:owner_id(full_name, email)')
        .is('deleted_at', null);
      const ids = (events ?? []).map((e) => e.id);
      const { data: insights } = await supabase
        .from('insights')
        .select('id, event_id, position, title, body')
        .in('event_id', ids.length ? ids : ['none'])
        .is('deleted_at', null);
      const { data: recs } = await supabase
        .from('recommendations')
        .select('insight_id, body')
        .in('insight_id', (insights ?? []).map((i) => i.id).concat('none'))
        .is('deleted_at', null);

      const header = [
        'Event',
        'Facilitator',
        'Status',
        'Created',
        'Insight #',
        'Insight title',
        'Insight body',
        'Recommendations',
      ];
      const lines = [header.map(csv).join(',')];
      for (const ins of insights ?? []) {
        const ev = (events ?? []).find((e) => e.id === ins.event_id);
        // deno-lint-ignore no-explicit-any
        const fac = (ev as any)?.profiles?.full_name || (ev as any)?.profiles?.email || '';
        const recList = (recs ?? [])
          .filter((r) => r.insight_id === ins.id)
          .map((r) => r.body)
          .join(' | ');
        lines.push(
          [
            ev?.title ?? '',
            fac,
            ev?.status ?? '',
            ev ? new Date(ev.created_at).toLocaleDateString() : '',
            ins.position,
            ins.title,
            ins.body,
            recList,
          ]
            .map(csv)
            .join(','),
        );
      }

      if (lines.length === 1) {
        Alert.alert('Nothing to export', 'No insights have been generated yet.');
        return;
      }

      const uri = `${FileSystem.documentDirectory}event-insight-export-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, lines.join('\n'));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export report data',
        });
      }
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <H1>Settings</H1>

      <Card>
        <H2>Admin account</H2>
        <P muted>
          The email treated as the administrator on sign-in and where event-logged
          alerts are sent. Set this to your admin login email.
        </P>
        <Input
          label="Admin email"
          value={adminEmail}
          onChangeText={setAdminEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="admin@example.com"
        />
      </Card>

      <Card>
        <H2>Email notifications</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <P>Email me when an event is logged</P>
          <Switch
            value={emailNotifications}
            onValueChange={setEmailNotifications}
            trackColor={{ true: colors.teal }}
          />
        </Row>
        <P muted>
          The in-app "Logged events" feed always updates; this only controls the
          email alert.
        </P>
      </Card>

      <Card>
        <H2>Export report data</H2>
        <P muted>
          Download a CSV of all events and their generated insights and
          recommendations.
        </P>
        <Button title="Export CSV" variant="secondary" onPress={exportData} loading={busy === 'export'} />
      </Card>

      <Card>
        <H2>Audio retention</H2>
        <P muted>Recordings auto-delete this many days after a transcript is approved.</P>
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
          record. Bump the version whenever you change the wording.
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

      <Button title="Save settings" onPress={saveSettings} loading={busy === 'settings'} />
    </Screen>
  );
}
