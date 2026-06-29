import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken() {
  // Push notifications only work on physical devices
  if (Platform.OS === 'web') return;

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
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      registerPushToken();
    }
  }, [isAuthenticated]);

  // Route notification taps to the relevant in-app screen
  useEffect(() => {
    if (!lastResponse || !isAuthenticated) return;
    const data = lastResponse.notification.request.content.data as Record<string, unknown>;
    if (data?.type === 'TOURNAMENT_OPEN' && data?.tournamentId) {
      router.push(`/torneos/inscripcion/${data.tournamentId}` as any);
    }
  }, [lastResponse, isAuthenticated]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
