import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Watermark, Wordmark, Field, Button, SocialSignIn } from '@/components';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/lib/hooks';

export default function Login() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  // Successful sign-in flips the session in AuthProvider; app/index.tsx then
  // routes by role. No manual navigation here.
  const signIn = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await auth.signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

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
          {/* Wordmark */}
          <View style={{ marginBottom: 44 }}>
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
              By Investigations Differently
            </Text>
          </View>

          {/* Form — starts empty; design copy lives in the placeholders */}
          <View style={{ gap: 12, marginBottom: 22 }}>
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
              placeholder="••••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              inputStyle={{ letterSpacing: 2.8 }}
            />
            <Pressable
              onPress={() => router.push('/forgot-password')}
              disabled={busy}
              hitSlop={8}
              style={{ alignSelf: 'flex-end' }}
            >
              <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#7FC4D6' }}>
                Forgot password?
              </Text>
            </Pressable>
          </View>

          {error && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12,
                lineHeight: 16.2,
                color: '#E4772A',
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          )}

          {/* Sign In */}
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
            <Button variant="primary" fullWidth onPress={signIn}>
              Sign in
            </Button>
          )}

          {/* OR Divider */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
              marginBottom: 16,
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
              or
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#33474F' }} />
          </View>

          {/* Google / Apple — signs in, or creates the account on first use */}
          <SocialSignIn busy={busy} onBusy={setBusy} onError={setError} />

          {/* Email + password sign-up */}
          <Pressable
            onPress={() => router.push('/(auth)/sign-up')}
            disabled={busy}
            hitSlop={8}
            style={{ marginTop: 18, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#7FC4D6' }}>
              New here? Create an account with email
            </Text>
          </Pressable>
        </ScrollView>

        {/* Footer — lifted above the system nav bar / gesture area */}
        <View style={{ paddingHorizontal: 26, paddingBottom: 30 + insets.bottom }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#22333F',
              borderRadius: 10,
              paddingHorizontal: 13,
              paddingVertical: 11,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: '#2CA5C0',
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 11,
                lineHeight: 14.85,
                color: '#9FB2B8',
                flex: 1,
              }}
            >
              Signed-in sessions work offline for 30 days on site.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
