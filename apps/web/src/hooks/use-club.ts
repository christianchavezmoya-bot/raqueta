import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';

export function useClubs() {
  return useQuery({
    queryKey: ['clubs'],
    queryFn: async () => {
      const { data } = await api.get('/clubs');
      return data;
    },
  });
}

export function useClub(clubId?: string) {
  return useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function useDashboardKPIs(clubId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/reports/clubs/${clubId}/dashboard`);
      return data;
    },
    enabled: !!clubId,
    refetchInterval: 60000,
  });
}

export function useReservations(clubId?: string, filters?: { date?: string; status?: string }) {
  return useQuery({
    queryKey: ['reservations', clubId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.date) params.set('date', filters.date);
      if (filters?.status) params.set('status', filters.status);
      const { data } = await api.get(`/clubs/${clubId}/reservations?${params}`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function useCourts(clubId?: string) {
  return useQuery({
    queryKey: ['courts', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/courts`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function useInstructors(clubId?: string) {
  return useQuery({
    queryKey: ['instructors', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/instructors`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function usePayments(clubId?: string, filters?: { status?: string }) {
  return useQuery({
    queryKey: ['payments', clubId, filters],
    queryFn: async () => {
      const params = filters?.status ? `?status=${filters.status}` : '';
      const { data } = await api.get(`/clubs/${clubId}/payments${params}`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function useTournaments(clubId?: string) {
  return useQuery({
    queryKey: ['tournaments', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments?clubId=${clubId}`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function useRankings(clubId?: string) {
  return useQuery({
    queryKey: ['rankings', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/rankings`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await api.get('/players');
      return data;
    },
  });
}

export function useMembershipPlans(clubId?: string, options?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: ['membership-plans', clubId, options?.includeInactive ?? false],
    queryFn: async () => {
      const query = options?.includeInactive ? '?includeInactive=true' : '';
      const { data } = await api.get(`/clubs/${clubId}/membership-plans${query}`);
      return data;
    },
    enabled: !!clubId,
  });
}

export function usePublicClubBySlug(slug?: string) {
  return useQuery({
    queryKey: ['club-public', slug],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/slug/${slug}`);
      return data;
    },
    enabled: !!slug,
  });
}

export function useClubAnnouncements(clubId?: string) {
  return useQuery({
    queryKey: ['club-announcements', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/announcements`);
      return data;
    },
    enabled: !!clubId,
  });
}
