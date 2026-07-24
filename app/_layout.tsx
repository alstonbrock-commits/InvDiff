import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { SyncProvider } from '@/lib/sync/SyncProvider';
import { colors } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface },
                  headerTintColor: colors.text,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="events/index" options={{ title: 'My Events' }} />
                <Stack.Screen name="events/new" options={{ title: 'New Event' }} />
                <Stack.Screen name="events/[id]/index" options={{ title: 'Event' }} />
                <Stack.Screen name="events/[id]/questions" options={{ title: 'Questions' }} />
                <Stack.Screen name="events/[id]/insights" options={{ title: 'Insights' }} />
                <Stack.Screen name="events/[id]/export" options={{ title: 'Export' }} />
                <Stack.Screen name="interviewee/new" options={{ title: 'Add Interviewee' }} />
                <Stack.Screen name="interviewee/[id]" options={{ title: 'Interview' }} />
                <Stack.Screen name="transcript/[id]" options={{ title: 'Transcript' }} />
                <Stack.Screen name="admin/index" options={{ title: 'Admin' }} />
                <Stack.Screen name="admin/approvals" options={{ title: 'Approvals' }} />
                <Stack.Screen name="admin/users" options={{ title: 'Users' }} />
                <Stack.Screen name="admin/settings" options={{ title: 'Settings' }} />
              </Stack>
            </SyncProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
