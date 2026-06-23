import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/stores/auth.store';
import api from '../src/lib/api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken() {
  // Push notifications only work on physical devices
  if (Platform.OS === 'web') return;
  // Temporary iOS fallback: local device builds can proceed without the
  // aps-environment entitlement while Apple account provisioning is unresolved.
  if (Platform.OS === 'ios') return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const { data: token } = await Notifications.getExpoPushTokenAsync();
  if (token) {
    // Best-effort: may fail if user is not logged in yet
    await api.post('/notifications/push-token', { token }).catch(() => {});
  }
}

export default function RootLayout() {
  const restoreSession = useAuthStore(s => s.restoreSession);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      registerPushToken();
    }
  }, [isAuthenticated]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
