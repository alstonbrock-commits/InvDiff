import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, H1, Input, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    if (!email || !password) return;
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      Alert.alert('Sign in failed', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Interview Insights</H1>
      <P muted>Sign in with the account your administrator invited.</P>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
      />
      <Button title="Sign in" onPress={onSignIn} loading={busy} />
      <P muted>
        No public sign-up. If you were invited by email, open the invite link on
        this device to set your password.
      </P>
    </Screen>
  );
}
