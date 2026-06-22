import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  playerProfile?: any;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
    set({ user: null, isAuthenticated: false });
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
