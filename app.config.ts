import { ExpoConfig, ConfigContext } from 'expo/config';

// App identity — CHANGE the bundle id before submitting to the stores.
const APP_NAME = 'Event Insight';
const BUNDLE_ID = 'com.investigationsdifferently.eventinsight';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'interview-insights',
  owner: 'brock_alston',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'interviewinsights',
  userInterfaceStyle: 'automatic',
  // Brand icons generated from the ID monogram (assets/id-mark-color.png) on
  // Ink Navy — see assets/icon.png / adaptive-icon.png / splash-icon.png.
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '1',
    // Sign in with Apple — mandatory on iOS once Google sign-in is offered.
    usesAppleSignIn: true,
    // Required-reason APIs used by our dependencies (AsyncStorage/UserDefaults,
    // file timestamps via expo-file-system, boot time / disk space via RN).
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
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
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1B2B3A',
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
    'expo-apple-authentication',
    'react-native-compressor',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#1B2B3A',
      },
    ],
    [
      'expo-av',
      {
        microphonePermission:
          'This app records audio answers to interview questions so they can be transcribed.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'This app attaches photos you choose to the event being logged.',
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'This app records audio answers to interview questions so they can be transcribed.',
        speechRecognitionPermission:
          'This app shows a live preview of the interview transcript while recording.',
      },
    ],
  ],
  extra: {
    // These are read at runtime from process.env at build time (EAS) or from a
    // local .env via app config. See src/lib/config.ts.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    // RevenueCat public SDK keys (Individual plan in-app purchases).
    rcIosKey: process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '',
    rcAndroidKey: process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '',
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '3f9ea4e1-0fae-4db4-8a4d-519ea7ac9286',
    },
  },
});
