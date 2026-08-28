import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { TabBar } from '@/components';
import { useAuth } from '@/lib/auth';
import { ROUTES, useGate } from '@/lib/gate';

export default function TabsLayout() {
  const { profile } = useAuth();
  const gate = useGate();

  // Declarative counterpart to sign-out / a lapsed plan: whenever the gate
  // points somewhere other than the app, go there. While it is still
  // deciding (null) stay put — that only happens mid-refresh.
  if (gate.target && gate.target !== ROUTES.app) return <Redirect href="/" />;

  const supervisor = profile?.org_role === 'supervisor';

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="(dashboard)" />
      <Tabs.Screen name="(events)" />
      <Tabs.Screen name="(insights)" />
      {/* Enterprise supervisors only; hidden (not just disabled) for everyone else. */}
      <Tabs.Screen name="(team)" options={{ href: supervisor ? undefined : null }} />
      <Tabs.Screen name="(account)" />
    </Tabs>
  );
}
