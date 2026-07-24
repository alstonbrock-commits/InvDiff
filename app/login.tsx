import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Brand, Button, Card, Input, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/lib/theme';

export default function Login() {
  const { signIn, signInWithProvider } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function oauth(provider: 'google' | 'apple') {
    setBusy(provider);
    try {
      await signInWithProvider(provider);
      router.replace('/');
    } catch (e) {
      Alert.alert('Sign in failed', String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function adminSignIn() {
    if (!email || !password) return;
    setBusy('admin');
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      Alert.alert('Sign in failed', String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ height: spacing(10) }} />
      {/* Long-press the logo to reveal the (hidden) administrator sign-in. */}
      <Pressable onLongPress={() => setAdminMode(true)} delayLongPress={900}>
        <Brand />
      </Pressable>
      <View style={{ height: spacing(6) }} />

      {!adminMode ? (
        <>
          <Card>
            <P muted>Create an account or sign in to start capturing events.</P>
            <Button
              title="Continue with Google"
              variant="navy"
              onPress={() => oauth('google')}
              loading={busy === 'google'}
            />
            <Button
              title="Continue with Apple"
              variant="secondary"
              onPress={() => oauth('apple')}
              loading={busy === 'apple'}
            />
          </Card>
          <P muted>No public admin. Sign in with Google or Apple to get started.</P>
        </>
      ) : (
        <Card>
          <P muted>Administrator sign-in.</P>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="admin@example.com"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          <Button title="Sign in" onPress={adminSignIn} loading={busy === 'admin'} />
          <Pressable onPress={() => setAdminMode(false)} style={{ padding: spacing(2) }}>
            <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 13 }}>
              ← Back
            </Text>
          </Pressable>
        </Card>
      )}
    </Screen>
  );
}
