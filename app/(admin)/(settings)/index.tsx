import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text, Pressable, Switch } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ScreenHeader,
  Eyebrow,
  Field,
  Button,
  Checkbox,
  alertDialog,
  showDialog,
} from '@/components';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/lib/hooks';
import {
  fetchDefaultQuestions,
  getSettings,
  updateAppSettings,
  updateDefaultQuestion,
  updateNewsletterOptIn,
} from '@/lib/remote';

export default function AdminSettings() {
  const { signOut, profile, retryProfile } = useAuth();
  const questions = useQuery({
    queryKey: ['default-questions'],
    queryFn: fetchDefaultQuestions,
  });
  const settings = useQuery({ queryKey: ['app-settings'], queryFn: getSettings });

  const [editingPosition, setEditingPosition] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [retention, setRetention] = useState<string | null>(null);
  const [maxInsights, setMaxInsights] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyboardHeight = useKeyboardHeight();

  const s = settings.data;

  // The admin is a subscriber like anyone else — they need the same
  // unsubscribe path as the facilitator Account tab.
  const [subscribed, setSubscribed] = useState(!!profile?.newsletter_opt_in);
  const [savingNews, setSavingNews] = useState(false);
  useEffect(() => {
    setSubscribed(!!profile?.newsletter_opt_in);
  }, [profile?.newsletter_opt_in]);

  const setNewsletter = async (next: boolean) => {
    if (savingNews || !profile) return;
    setSubscribed(next);
    setSavingNews(true);
    try {
      await updateNewsletterOptIn(profile.id, next);
      await retryProfile();
    } catch (e) {
      setSubscribed(!next);
      alertDialog('Could not save that', String(e));
    } finally {
      setSavingNews(false);
    }
  };

  const confirmSignOut = () => {
    showDialog({
      variant: 'confirm',
      title: 'Sign out',
      body: 'Unsynced work stays on this device.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Sign out',
      onConfirm: () => void signOut(),
    });
  };

  const saveQuestion = async () => {
    if (editingPosition === null) return;
    try {
      await updateDefaultQuestion(editingPosition, questionDraft.trim());
      setEditingPosition(null);
      await questions.refetch();
    } catch (e) {
      alertDialog('Could not save the question', String(e));
    }
  };

  const saveSettings = async () => {
    if (saving || !s) return;
    setSaving(true);
    try {
      const clamp = (v: string | null, fallback: number, lo: number, hi: number) => {
        const n = v === null ? fallback : parseInt(v, 10);
        return isNaN(n) ? fallback : Math.min(Math.max(n, lo), hi);
      };
      await updateAppSettings({
        admin_email: adminEmail === null ? s.admin_email : adminEmail.trim() || null,
        audio_retention_days: clamp(retention, s.audio_retention_days, 1, 3650),
        max_insights: clamp(maxInsights, s.max_insights, 1, 5),
      });
      await settings.refetch();
      setAdminEmail(null);
      setRetention(null);
      setMaxInsights(null);
      showDialog({
        variant: 'success',
        title: 'Settings saved',
        body: 'Changes apply from the next event and analysis run.',
      });
    } catch (e) {
      alertDialog('Could not save settings', String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    try {
      await updateAppSettings({ email_notifications: value });
      await settings.refetch();
    } catch (e) {
      alertDialog('Could not update notifications', String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Settings"
        subtitle={profile?.email ?? ''}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: 24 + keyboardHeight,
          gap: 10,
        }}
      >
        {/* -- Questions ----------------------------------------------------- */}
        <Eyebrow>Interview questions</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {(questions.data ?? []).map((q, index) => (
            <View
              key={q.position}
              style={{
                padding: 13,
                borderBottomWidth: index < (questions.data?.length ?? 0) - 1 ? 1 : 0,
                borderBottomColor: '#EFEDE7',
              }}
            >
              {editingPosition === q.position ? (
                <View style={{ gap: 8 }}>
                  <Field
                    label={`Question ${q.position}`}
                    value={questionDraft}
                    onChangeText={setQuestionDraft}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onPress={() => setEditingPosition(null)}
                      >
                        Cancel
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        onPress={() => void saveQuestion()}
                      >
                        Save
                      </Button>
                    </View>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setEditingPosition(q.position);
                    setQuestionDraft(q.text);
                  }}
                  style={{ flexDirection: 'row', gap: 9, alignItems: 'baseline' }}
                >
                  <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 10, color: '#2CA5C0' }}>
                    {String(q.position).padStart(2, '0')}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 12.5,
                      lineHeight: 18.75,
                      color: '#3A474D',
                      flex: 1,
                    }}
                  >
                    {q.text}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
          {questions.isError && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12.5,
                color: '#5D6B70',
                padding: 13,
              }}
            >
              Questions are online-only — reconnect to edit them.
            </Text>
          )}
        </View>
        <Text style={{ fontFamily: 'PublicSans-400', fontSize: 11, color: '#8A9499' }}>
          Changes apply to new events only — running events keep their questions.
        </Text>

        {/* -- Notifications ------------------------------------------------- */}
        <Eyebrow style={{ marginTop: 8 }}>Notifications</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            padding: 13,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13.5, color: '#17262D' }}>
              Email me when an event is logged
            </Text>
            <Switch
              value={s?.email_notifications ?? false}
              onValueChange={(v) => void toggleNotifications(v)}
              trackColor={{ false: '#D8DDDE', true: '#2CA5C0' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Field
            label="Admin email"
            value={adminEmail ?? s?.admin_email ?? ''}
            onChangeText={setAdminEmail}
            placeholder="admin@investigations.au"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </View>

        {/* -- AI ------------------------------------------------------------ */}
        <Eyebrow style={{ marginTop: 8 }}>AI analysis</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            padding: 13,
            gap: 12,
          }}
        >
          <Field
            label="Max insights per event (1–5)"
            value={maxInsights ?? String(s?.max_insights ?? 5)}
            onChangeText={setMaxInsights}
            keyboardType="number-pad"
          />
          <Field
            label="Audio backstop retention (days — events with no report)"
            value={retention ?? String(s?.audio_retention_days ?? 90)}
            onChangeText={setRetention}
            keyboardType="number-pad"
          />
        </View>

        <Button variant="primary" size="sm" fullWidth onPress={() => void saveSettings()}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>

        {/* Unsubscribe path — required for any marketing email we send. */}
        <Eyebrow style={{ marginTop: 8 }}>Email preferences</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 12,
            padding: 13,
          }}
        >
          <Checkbox
            checked={subscribed}
            disabled={savingNews}
            onChange={(next) => void setNewsletter(next)}
            label="Email me updates and insights from Investigations Differently"
            hint={
              savingNews
                ? 'Saving…'
                : subscribed
                  ? 'Untick to unsubscribe.'
                  : 'You are not subscribed.'
            }
          />
        </View>

        <View style={{ marginTop: 8 }}>
          <Button variant="danger-ghost" size="sm" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
