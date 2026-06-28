'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Hooks for the Stage 12 favorites + notification category preferences surface.
 *
 * All endpoints are gated by authentication; an unauthenticated viewer should
 * be routed through `useFavoriteStatus` returning `null` and the UI must
 * gracefully render a "Sign in to favorite" CTA instead.
 */

export type NotificationCategoryKey =
  | 'EVENTS'
  | 'OFFERS'
  | 'MEMBERSHIP_OFFERS'
  | 'MATCH_FINDING';

export interface PlayerNotificationPreferences {
  userId: string;
  notifyEvents: boolean;
  notifyOffers: boolean;
  notifyMembershipOffers: boolean;
  notifyMatchFinding: boolean;
  updatedAt: string | null;
  isDefault: boolean;
}

export interface MyFavorite {
  id: string;
  clubId: string;
  createdAt: string;
  club: {
    id: string;
    name: string;
    slug: string;
    status: string;
    profile: {
      logoUrl: string | null;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
      accentColor: string | null;
    } | null;
  };
}

export function useMyFavorites(enabled = true) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-favorites'],
    queryFn: async () => {
      const { data } = await api.get<MyFavorite[]>('/players/me/favorites');
      return data;
    },
    enabled: enabled && isAuthenticated,
    staleTime: 30_000,
  });
}

export function useFavoriteClubIds(clubIds: string[]) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-favorites-ids', clubIds.slice().sort().join(',')],
    queryFn: async () => {
      // We piggyback on the list endpoint; the mobile app could use a dedicated
      // batch endpoint but for the public club page we only ever check one id.
      const { data } = await api.get<MyFavorite[]>('/players/me/favorites');
      const set = new Set(data.map(f => f.clubId));
      return clubIds.filter(id => set.has(id));
    },
    enabled: isAuthenticated && clubIds.length > 0,
    staleTime: 30_000,
  });
}

export function useToggleFavorite(clubId: string) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useMutation({
    mutationFn: async (currentlyFavorite: boolean) => {
      if (!isAuthenticated) throw new Error('AUTH_REQUIRED');
      if (currentlyFavorite) {
        await api.delete(`/clubs/${clubId}/favorites`);
        return { favorite: false };
      }
      await api.post(`/clubs/${clubId}/favorites`);
      return { favorite: true };
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['my-favorites'] });
      queryClient.invalidateQueries({ queryKey: ['my-favorites-ids'] });
      toast.success(result.favorite ? 'Club agregado a favoritos' : 'Club quitado de favoritos');
    },
    onError: (err: any) => {
      if (err?.message === 'AUTH_REQUIRED') {
        toast.error('Inicia sesión para agregar favoritos');
        return;
      }
      toast.error(err?.response?.data?.message ?? 'No se pudo actualizar favoritos');
    },
  });
}

export function useMyNotificationPreferences() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-notification-preferences'],
    queryFn: async () => {
      const { data } = await api.get<PlayerNotificationPreferences>('/players/me/notification-preferences');
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<PlayerNotificationPreferences, 'userId' | 'updatedAt' | 'isDefault'>>) => {
      const { data } = await api.patch<PlayerNotificationPreferences>(
        '/players/me/notification-preferences',
        patch,
      );
      return data;
    },
    onSuccess: data => {
      queryClient.setQueryData(['my-notification-preferences'], data);
      toast.success('Preferencias actualizadas');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? 'No se pudieron guardar las preferencias'),
  });
}
