import { ExpoConfig, ConfigContext } from 'expo/config';

// App identity — CHANGE these before submitting to the stores.
const APP_NAME = 'Interview Insights';
const BUNDLE_ID = 'com.yourorg.interviewinsights';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'interview-insights',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'interviewinsights',
  userInterfaceStyle: 'automatic',
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#0F172A',
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
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
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
