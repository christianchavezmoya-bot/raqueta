import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import {
  useMyFavoriteAnnouncementFeed,
  useMyFavorites,
} from './use-favorites';

/**
 * Three-state model that drives the mobile Home screen, in priority order:
 *
 *   3. "club" — the player has ≥1 ACTIVE membership.
 *   2. "no club, but data" — favorites, upcoming reservations, or match-log
 *      entries exist. Sections render with real content.
 *   1. "no club, no data" — brand-new user. Every section renders an empty
 *      state with an inviting CTA.
 *
 * The check intentionally orders membership FIRST so a member with a thin
 * profile still gets the club experience. The check for state 2 is a
 * superset ("any signal of activity"), not a strict membership-vs-no-club
 * gate, so a member with a bare profile never drops into the no-club branch.
 */
export type HomeState = 1 | 2 | 3;

export interface MyMembershipLite {
  id: string;
  status: string;
  club?: { id: string; name: string } | null;
}

export function useMyMembershipsLite() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-memberships-home'],
    queryFn: async () => {
      const { data } = await api.get<MyMembershipLite[]>('/users/me/memberships');
      return data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export interface UpcomingReservationItem {
  id: string;
  startTime: string;
  status: string;
  court?: { id?: string; name: string } | null;
  club?: { id?: string; name: string; profile?: { name?: string } | null } | null;
}

export function useMyUpcomingReservations() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-reservations-home'],
    queryFn: async () => {
      const { data } = await api.get<{ data: UpcomingReservationItem[]; total: number }>(
        '/users/me/reservations?limit=10',
      );
      // The endpoint doesn't filter to "upcoming" — trim client-side so the
      // Home preview shows what the player actually has next, regardless of
      // club. We keep an "upcoming" semantic: endTime > now, sorted soonest-first.
      const now = Date.now();
      const list = (data?.data ?? []).filter(r => {
        const t = new Date(r.startTime).getTime();
        return t >= now - 30 * 60 * 1000; // include "just started" by 30 min grace
      });
      list.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
      return list.slice(0, 5);
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export interface MatchLogEntryLite {
  id: string;
  type: string;
  playedAt: string;
  playerWon?: boolean | null;
  opponentName?: string | null;
  scoreSummary?: string | null;
}

export function useMyMatchLogLite() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({
    queryKey: ['my-match-log-home'],
    queryFn: async () => {
      const { data } = await api.get<{ data: MatchLogEntryLite[] }>(
        '/players/me/match-log?limit=5',
      );
      return data?.data ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/**
 * Composed hook that returns the resolved state plus the raw signals.
 * The screen asks for one state and then queries/infers what to render
 * for each section, so we keep the section-level queries as separate
 * hooks (so caching / refetch can stay independent).
 */
export function useHomeState(): {
  state: HomeState | 'loading';
  hasMemberships: boolean;
  activeMemberships: MyMembershipLite[];
  hasFavorites: boolean;
  hasUpcomingReservations: boolean;
  hasMatchLog: boolean;
} {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const memberships = useMyMembershipsLite();
  const favorites = useMyFavorites();
  const reservations = useMyUpcomingReservations();
  const matchLog = useMyMatchLogLite();
  // Subscribe to the feed query so we don't refetch redundantly, but only
  // read whether it's loaded — the section itself decides what to render.
  useMyFavoriteAnnouncementFeed();

  return useMemo(() => {
    if (!isAuthenticated) {
      return {
        state: 'loading' as const,
        hasMemberships: false,
        activeMemberships: [],
        hasFavorites: false,
        hasUpcomingReservations: false,
        hasMatchLog: false,
      };
    }

    const anyLoading =
      memberships.isLoading ||
      favorites.isLoading ||
      reservations.isLoading ||
      matchLog.isLoading;

    const activeMemberships = (memberships.data ?? []).filter(m => m.status === 'ACTIVE');
    const hasMemberships = activeMemberships.length > 0;
    const hasFavorites = (favorites.data ?? []).length > 0;
    const hasUpcomingReservations = (reservations.data ?? []).length > 0;
    const hasMatchLog = (matchLog.data ?? []).length > 0;

    if (anyLoading) {
      return {
        state: 'loading' as const,
        hasMemberships,
        activeMemberships,
        hasFavorites,
        hasUpcomingReservations,
        hasMatchLog,
      };
    }

    let state: HomeState;
    if (hasMemberships) {
      state = 3;
    } else if (hasFavorites || hasUpcomingReservations || hasMatchLog) {
      state = 2;
    } else {
      state = 1;
    }

    return {
      state,
      hasMemberships,
      activeMemberships,
      hasFavorites,
      hasUpcomingReservations,
      hasMatchLog,
    };
  }, [
    isAuthenticated,
    memberships.isLoading,
    memberships.data,
    favorites.isLoading,
    favorites.data,
    reservations.isLoading,
    reservations.data,
    matchLog.isLoading,
    matchLog.data,
  ]);
}