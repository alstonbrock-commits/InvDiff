import React, { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Wordmark, Field, Button, Checkbox } from '@/components';
import { useAuth } from '@/lib/auth';
import { ROUTES, useGate } from '@/lib/gate';
import { useKeyboardHeight } from '@/lib/hooks';

// ROOT-level: a Google/Apple sign-up arrives with a name (maybe) and no job
// title. Both are compulsory on the email sign-up form, so collect them here
// before the plan gate. Email + password accounts never see this screen.

export default function CompleteProfile() {
  const gate = useGate();
  const { profile, updateProfileDetails } = useAuth();
  const keyboardHeight = useKeyboardHeight();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '');
  // Opt-out by design, matching the sign-up screen.
  const [newsletter, setNewsletter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gate.target && gate.target !== ROUTES.completeProfile) return <Redirect href="/" />;

  const canSave = fullName.trim().length > 0 && jobTitle.trim().length > 0;

  const save = async () => {
    if (busy || !canSave) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfileDetails({
        full_name: fullName,
        job_title: jobTitle,
        newsletter_opt_in: newsletter,
      });
      // Profile reloads; the gate moves on and the Redirect above fires.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1B2B3A' }} edges={[]}>
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 26 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          justifyContent: 'center',
          minHeight: '100%',
          paddingBottom: keyboardHeight,
        }}
      >
        <View style={{ marginBottom: 34 }}>
          <Wordmark size="lg" surface="navy" />
          <Text
            style={{
              fontFamily: 'IBMPlexMono-400',
              fontSize: 8.5,
              lineHeight: 8.5,
              color: '#7FC4D6',
              marginTop: 9,
              paddingLeft: 2,
              textTransform: 'uppercase',
            }}
          >
            Finish setting up your account
          </Text>
        </View>

        <Text
          style={{
            fontFamily: 'PublicSans-400',
            fontSize: 13.5,
            lineHeight: 19.5,
            color: '#9FB2B8',
            marginBottom: 18,
          }}
        >
          Your name appears on the reports you generate. Your job title helps us
          understand who uses Event Insight.
        </Text>

        <View style={{ gap: 12 }}>
          <Field
            label="Full name"
            variant="navy"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Jordan Mercer"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
          />
          <Field
            label="Job title"
            variant="navy"
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="Investigator"
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        <View style={{ marginTop: 18 }}>
          <Checkbox
            variant="navy"
            checked={newsletter}
            onChange={setNewsletter}
            disabled={busy}
            label="Email me updates and insights from Investigations Differently"
            hint="Occasional newsletters. You can unsubscribe any time from your Account."
          />
        </View>

        {error && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 12,
              lineHeight: 16.2,
              color: '#E4772A',
              marginTop: 12,
            }}
          >
            {error}
          </Text>
        )}

        <View style={{ marginTop: 22 }}>
          <Button
            variant="primary"
            fullWidth
            disabled={busy || !canSave}
            onPress={() => void save()}
          >
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
