import 'react-native-gesture-handler';
import React from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth';
import { EntitlementProvider } from '@/lib/entitlement';
import { SyncProvider } from '@/lib/sync/SyncProvider';
import { DialogHost } from '@/components';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Static weights ship in the @expo-google-fonts packages. google/fonts itself only
  // publishes variable TTFs for these families, which Android can't select instances
  // from by fontFamily alone.
  const [fontsLoaded, fontError] = useFonts({
    'Archivo-700': require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
    'Archivo-800': require('@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf'),
    'PublicSans-400': require('@expo-google-fonts/public-sans/400Regular/PublicSans_400Regular.ttf'),
    'PublicSans-500': require('@expo-google-fonts/public-sans/500Medium/PublicSans_500Medium.ttf'),
    'PublicSans-600': require('@expo-google-fonts/public-sans/600SemiBold/PublicSans_600SemiBold.ttf'),
    'PublicSans-700': require('@expo-google-fonts/public-sans/700Bold/PublicSans_700Bold.ttf'),
    'IBMPlexMono-400': require('@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'),
    'IBMPlexMono-500': require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
  });

  React.useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <EntitlementProvider>
            <SyncProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(admin)" />
                {/* Interstitials between sign-in and the app — no back gesture.
                    (paywall is NOT one of these: it opens on demand.) */}
                <Stack.Screen name="paywall" />
                <Stack.Screen name="account-inactive" options={{ gestureEnabled: false }} />
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
                <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
                <Stack.Screen
                  name="insight-detail"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </Stack>
              <DialogHost />
            </SyncProvider>
            </EntitlementProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
