import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts as useArchivo, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import {
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
} from '@expo-google-fonts/public-sans';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { AuthProvider } from '@/lib/auth';
import { SyncProvider } from '@/lib/sync/SyncProvider';
import { colors, fonts } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useArchivo({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.navy },
                  headerTintColor: colors.textOnNavy,
                  headerTitleStyle: { fontFamily: fonts.displayBold, color: colors.textOnNavy },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="events/index" options={{ headerShown: false }} />
                <Stack.Screen name="events/new" options={{ title: 'New Event' }} />
                <Stack.Screen name="events/[id]/index" options={{ title: 'Event' }} />
                <Stack.Screen name="events/[id]/questions" options={{ title: 'Questions' }} />
                <Stack.Screen name="events/[id]/transcripts" options={{ title: 'Review transcripts' }} />
                <Stack.Screen name="events/[id]/insights" options={{ title: 'Insights' }} />
                <Stack.Screen name="events/[id]/export" options={{ title: 'Export' }} />
                <Stack.Screen name="interviewee/new" options={{ title: 'Add Interviewee' }} />
                <Stack.Screen name="interviewee/[id]" options={{ title: 'Interview' }} />
                <Stack.Screen name="transcript/[id]" options={{ title: 'Transcript' }} />
                <Stack.Screen name="admin/index" options={{ headerShown: false }} />
                <Stack.Screen name="admin/questions" options={{ title: 'Questions' }} />
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
