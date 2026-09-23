import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useGate } from '@/lib/gate';
import { Button } from '@/components';

// Entry router — navigation logic only. Where the user lands is decided by
// useGate (login → admin → complete profile → plan → onboarding → app).
export default function Index() {
  const { retryProfile } = useAuth();
  const gate = useGate();

  // Session exists but no profile (fresh network failure with an empty cache).
  // Offer retry rather than dead-ending on a blank screen.
  if (gate.noProfile) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#F6F5F1',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 16,
        }}
      >
        <ActivityIndicator color="#E4772A" />
        <Text
          style={{
            fontFamily: 'PublicSans-400',
            fontSize: 13,
            lineHeight: 19.5,
            color: '#5D6B70',
            textAlign: 'center',
          }}
        >
          Couldn't load your account. Check your connection and try again.
        </Text>
        <Button variant="secondary" size="sm" onPress={() => void retryProfile()}>
          Retry
        </Button>
      </View>
    );
  }

  if (!gate.target) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F6F5F1', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E4772A" />
      </View>
    );
  }
  return <Redirect href={gate.target} />;
}
