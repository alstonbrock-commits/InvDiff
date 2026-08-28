import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  // Signed in → index routes by role. Declarative counterpart to sign-in.
  if (!loading && session) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
    />
  );
}
