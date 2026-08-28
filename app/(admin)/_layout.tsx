import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { TabBar } from '@/components';
import { useAuth } from '@/lib/auth';

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();

  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  // Facilitators have no business here.
  if (!loading && profile && profile.role !== 'admin') {
    return <Redirect href="/(tabs)/(dashboard)" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="(dashboard)" />
      <Tabs.Screen name="(reports)" />
      <Tabs.Screen name="(users)" />
      <Tabs.Screen name="(settings)" />
    </Tabs>
  );
}
