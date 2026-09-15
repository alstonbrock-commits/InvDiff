import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { TabBar } from '@/components';
import { ROUTES, useGate } from '@/lib/gate';

export default function TabsLayout() {
  const gate = useGate();

  // Declarative counterpart to sign-out / deactivation: whenever the gate
  // points somewhere other than the app, go there DIRECTLY. Redirecting via
  // "/" chained two redirects in one commit (tabs → index → login), which
  // stranded expo-router on a blank scene after sign-out. While the gate is
  // still deciding (null) stay put — that only happens mid-refresh.
  if (gate.target && gate.target !== ROUTES.app) {
    return <Redirect href={gate.target} />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="(dashboard)" />
      <Tabs.Screen name="(events)" />
      <Tabs.Screen name="(insights)" />
      <Tabs.Screen name="(account)" />
    </Tabs>
  );
}
