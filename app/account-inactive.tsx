import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { ScreenHeader, Button, Eyebrow, showDialog } from '@/components';
import { useAuth } from '@/lib/auth';
import { ROUTES, useGate } from '@/lib/gate';
import { SUPPORT_EMAIL } from '@/fixtures/legal';

// ROOT-level interstitial for accounts an operator has deactivated
// (profiles.is_active = false). Rare by design.
export default function AccountInactive() {
  const insets = useSafeAreaInsets();
  const gate = useGate();
  const { signOut } = useAuth();

  if (gate.target && gate.target !== ROUTES.inactive) return <Redirect href="/" />;

  const confirmSignOut = () =>
    showDialog({
      variant: 'confirm',
      title: 'Sign out',
      body: 'You can sign back in any time.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Sign out',
      onConfirm: () => void signOut(),
    });

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="brand" showWatermark />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingHorizontal: 16,
          paddingBottom: 24 + insets.bottom,
          gap: 12,
        }}
      >
        <Eyebrow>Your account</Eyebrow>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E3DC',
            borderRadius: 14,
            padding: 18,
            gap: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: 22,
              letterSpacing: -0.44,
              color: '#17262D',
            }}
          >
            Account deactivated
          </Text>
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13.5,
              lineHeight: 20,
              color: '#3A474D',
            }}
          >
            This account has been deactivated. If you think this is a mistake, contact us at{' '}
            {SUPPORT_EMAIL}.
          </Text>
        </View>

        <View style={{ marginTop: 6 }}>
          <Button variant="danger-ghost" size="sm" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
