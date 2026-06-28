import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

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

export function useIsClubFavorite(clubId: string | undefined) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data: favorites } = useMyFavorites();
  if (!isAuthenticated || !clubId) return false;
  return (favorites ?? []).some(f => f.clubId === clubId);
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
      queryClient.invalidateQueries({ queryKey: ['clubs-explore'] });
      queryClient.invalidateQueries({ queryKey: ['club-detail', clubId] });
    },
  });
}

export function useMyNotificationPreferences() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-notification-preferences'],
    queryFn: async () => {
      const { data } = await api.get<PlayerNotificationPreferences>(
        '/players/me/notification-preferences',
      );
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/**
 * One entry per favorited club with its most-recent announcement. Used by
 * the mobile Home screen carousel. Category-mute filtering already happens
 * server-side, so an entry that comes back here is by definition not muted.
 */
export interface FavoriteAnnouncementFeedItem {
  clubId: string;
  clubName: string;
  clubSlug: string;
  clubLogoUrl: string | null;
  clubAccentColor: string | null;
  announcement: {
    id: string;
    title: string;
    body: string;
    category: string;
    createdAt: string;
  };
}

export function useMyFavoriteAnnouncementFeed(enabled = true) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-favorite-announcements'],
    queryFn: async () => {
      const { data } = await api.get<FavoriteAnnouncementFeedItem[]>(
        '/players/me/favorite-announcements',
      );
      return data;
    },
    enabled: enabled && isAuthenticated,
    staleTime: 30_000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Omit<PlayerNotificationPreferences, 'userId' | 'updatedAt' | 'isDefault'>
      >,
    ) => {
      const { data } = await api.patch<PlayerNotificationPreferences>(
        '/players/me/notification-preferences',
        patch,
      );
      return data;
    },
    onSuccess: data => {
      queryClient.setQueryData(['my-notification-preferences'], data);
    },
  });
}
