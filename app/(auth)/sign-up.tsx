import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Wordmark, Field, Button, Checkbox, SocialSignIn } from '@/components';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/lib/hooks';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const auth = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Opt-out by design: subscribed unless the person unticks it.
  const [newsletter, setNewsletter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  // Every field is compulsory — job title included.
  const canCreate =
    fullName.trim().length > 0 &&
    jobTitle.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    password.length >= 8;

  const createAccount = async () => {
    if (busy || !canCreate) return;
    setError(null);
    setBusy(true);
    try {
      await auth.signUpWithEmail(email.trim(), password, {
        full_name: fullName.trim(),
        job_title: jobTitle.trim(),
        newsletter_opt_in: newsletter,
      });
      // Session flips in AuthProvider; the auth guard routes away.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create the account.';
      setError(
        /already registered|already been registered/i.test(msg)
          ? 'That email already has an account — go back and sign in instead.'
          : msg,
      );
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
        {/* Wordmark + screen eyebrow */}
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
            Create your account
          </Text>
        </View>

        {/* All fields are required to create an account */}
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
          <Field
            label="Email"
            variant="navy"
            value={email}
            onChangeText={setEmail}
            placeholder="j.mercer@investigations.au"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
          />

          <Field
            label="Password"
            variant="navy"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        {/* Opt-out: ticked by default, unticking is one tap and visible here. */}
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

        {/* Create the account */}
        <View style={{ marginTop: 22 }}>
          <Button
            variant="primary"
            fullWidth
            disabled={busy || !canCreate}
            onPress={() => void createAccount()}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </View>

        {/* OR divider + Google / Apple */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 20,
            marginBottom: 14,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: '#33474F' }} />
          <Text
            style={{
              fontFamily: 'IBMPlexMono-400',
              fontSize: 9,
              color: '#7F929A',
              textTransform: 'uppercase',
              letterSpacing: 1.8,
            }}
          >
            or continue with
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: '#33474F' }} />
        </View>
        <SocialSignIn busy={busy} onBusy={setBusy} onError={setError} />

        {/* Back to sign in */}
        <Pressable
          onPress={() => router.back()}
          disabled={busy}
          hitSlop={8}
          style={{ marginTop: 24, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#7FC4D6' }}>
            Back to sign in
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
