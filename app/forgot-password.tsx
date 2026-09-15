import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Watermark, Wordmark, Field, Button, showDialog } from '@/components';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/lib/hooks';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// IMPORTANT: this screen lives at the ROOT, not in app/(auth)/ — verifying the
// recovery code creates a session, and the (auth) layout redirects to "/" the
// moment one exists, which would eject the user before they set a password.
type Step = 'email' | 'code' | 'password';

const STEP_COPY: Record<Step, { eyebrow: string; body: string }> = {
  email: {
    eyebrow: 'Reset your password',
    body: 'You sign in with your email address. Enter it below and we will email you a 6-digit code.',
  },
  code: {
    eyebrow: 'Check your email',
    body: 'If an account exists for that address, a 6-digit code is on its way. Enter it below.',
  },
  password: {
    eyebrow: 'Choose a new password',
    body: 'At least 8 characters. You will be signed in straight away.',
  },
};

export default function ForgotPassword() {
  const auth = useAuth();
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown — Supabase rate-limits recovery emails to one a minute.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async () => {
    if (busy) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter the email address you sign in with.');
      return;
    }
    setBusy(true);
    try {
      await auth.requestPasswordReset(email);
      setStep('code');
      setCooldown(60);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send the code.';
      setError(
        /rate limit/i.test(msg)
          ? 'A code was sent recently — check your email, or wait a minute and try again.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (busy) return;
    setError(null);
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    try {
      await auth.verifyResetCode(email, code);
      setStep('password');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /expired|invalid|not found/i.test(msg)
          ? 'That code is wrong or has expired — check the email, or resend a new one.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (busy) return;
    setError(null);
    if (password.length < 8) {
      setError('The password needs at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await auth.setPassword(password);
      showDialog({
        variant: 'success',
        title: 'Password updated',
        body: 'You are signed in with your new password.',
        confirmLabel: 'Continue',
        onConfirm: () => router.replace('/'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  };

  const submit = step === 'email' ? sendCode : step === 'code' ? verifyCode : savePassword;
  const submitLabel =
    step === 'email' ? 'Send code' : step === 'code' ? 'Verify code' : 'Set new password';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1B2B3A' }} edges={[]}>
      <View
        style={{
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1B2B3A',
          flex: 1,
        }}
      >
        <Watermark top={18} right={-34} size={200} />

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
              {STEP_COPY[step].eyebrow}
            </Text>
          </View>

          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#9FB2B8',
              marginBottom: 18,
            }}
          >
            {STEP_COPY[step].body}
          </Text>

          <View style={{ gap: 12 }}>
            {step === 'email' && (
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
            )}

            {step === 'code' && (
              <Field
                label="6-digit code"
                variant="navy"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                autoCorrect={false}
                editable={!busy}
                inputStyle={{ letterSpacing: 6, fontFamily: 'IBMPlexMono-400' }}
              />
            )}

            {step === 'password' && (
              <Field
                label="New password"
                variant="navy"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
            )}
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
            {busy ? (
              <View
                style={{
                  backgroundColor: '#E4772A',
                  borderRadius: 12,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: 0.8,
                }}
              >
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : (
              <Button variant="primary" fullWidth onPress={() => void submit()}>
                {submitLabel}
              </Button>
            )}
          </View>

          {step === 'code' && (
            <Pressable
              onPress={() => void sendCode()}
              disabled={busy || cooldown > 0}
              hitSlop={8}
              style={{ marginTop: 18, alignItems: 'center' }}
            >
              <Text
                style={{
                  fontFamily: 'PublicSans-600',
                  fontSize: 13,
                  color: cooldown > 0 ? '#5D6B70' : '#7FC4D6',
                }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>
          )}

          {step !== 'password' && (
            <Pressable
              onPress={() => router.back()}
              disabled={busy}
              hitSlop={8}
              style={{ marginTop: step === 'code' ? 14 : 24, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#7FC4D6' }}>
                Back to sign in
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
