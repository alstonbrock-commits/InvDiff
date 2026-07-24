import { ExpoConfig, ConfigContext } from 'expo/config';

// App identity — CHANGE the bundle id before submitting to the stores.
const APP_NAME = 'Event Insight';
const BUNDLE_ID = 'com.investigationsdifferently.eventinsight';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'interview-insights',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'interviewinsights',
  userInterfaceStyle: 'automatic',
  icon: './assets/id-mark-color.png',
  splash: {
    image: './assets/id-mark-color.png',
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '1',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'This app records audio answers to interview questions so they can be transcribed.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    versionCode: 1,
    permissions: ['RECORD_AUDIO', 'INTERNET'],
    adaptiveIcon: {
      foregroundImage: './assets/id-mark-color.png',
      backgroundColor: '#FFFFFF',
    },
  },
  // NOTE: expo-sqlite is NOT listed here — it ships no config plugin, and listing
  // it makes Expo try to load its ESM main during config eval, which crashes.
  // The library works fine at runtime (Metro bundles it); it just isn't a plugin.
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    [
      'expo-av',
      {
        microphonePermission:
          'This app records audio answers to interview questions so they can be transcribed.',
      },
    ],
    'expo-task-manager',
  ],
  extra: {
    // These are read at runtime from process.env at build time (EAS) or from a
    // local .env via app config. See src/lib/config.ts.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
});
