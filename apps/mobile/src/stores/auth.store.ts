import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  playerProfile?: any;
  twoFactorEnabled?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // 2FA intermediate state
  pendingLoginToken: string | null;
  login: (email: string, password: string) => Promise<{ twoFactorRequired: boolean }>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  pendingLoginToken: null,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.twoFactorRequired) {
      set({ pendingLoginToken: data.loginToken });
      return { twoFactorRequired: true };
    }
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, pendingLoginToken: null });
    return { twoFactorRequired: false };
  },

  verify2FA: async (code: string) => {
    const { pendingLoginToken } = get();
    if (!pendingLoginToken) throw new Error('No pending 2FA session');
    const { data } = await api.post('/auth/2fa/verify', { loginToken: pendingLoginToken, code });
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, pendingLoginToken: null });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
    set({ user: null, isAuthenticated: false, pendingLoginToken: null });
  },

  restoreSession: async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return set({ isLoading: false });
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
    } finally {
      set({ isLoading: false });
    }
  },
}));
