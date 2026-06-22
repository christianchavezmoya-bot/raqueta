import { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });

  const { data: clubs, refetch, isLoading } = useQuery({
    queryKey: ['clubs-home'],
    queryFn: async () => { const { data } = await api.get('/clubs?limit=3'); return data; },
  });

  const { data: myReservations } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: async () => { const { data } = await api.get('/users/me/reservations?limit=2'); return data; },
  });

  const profile = me?.playerProfile;
  const nextReservation = myReservations?.data?.[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const quickActions = [
    { label: 'Reservar cancha', icon: 'tennisball', color: '#16a34a', onPress: () => router.push('/(tabs)/explore') },
    { label: 'Ver torneos', icon: 'trophy', color: '#d97706', onPress: () => router.push('/(tabs)/tournaments') },
    { label: 'Mi ranking', icon: 'bar-chart', color: '#7c3aed', onPress: () => router.push('/(tabs)/profile') },
    { label: 'Calendario', icon: 'calendar', color: '#0284c7', onPress: () => router.push('/(tabs)/calendar') },
  ];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting},</Text>
          <Text style={s.name}>{profile?.displayName ?? user?.email?.split('@')[0] ?? 'Jugador'} 👋</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={s.avatar}>
          <Text style={s.avatarText}>
            {(profile?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {/* Next reservation banner */}
        {nextReservation && (
          <View style={s.nextBanner}>
            <View style={s.nextBannerLeft}>
              <Text style={s.nextBannerLabel}>Próxima reserva</Text>
              <Text style={s.nextBannerTitle}>{nextReservation.court?.name}</Text>
              <Text style={s.nextBannerTime}>
                {format(new Date(nextReservation.startTime), "EEE d 'de' MMM · HH:mm", { locale: es })}
              </Text>
            </View>
            <Ionicons name="tennisball" size={40} color="rgba(255,255,255,0.4)" />
          </View>
        )}

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Acciones rápidas</Text>
        <View style={s.quickGrid}>
          {quickActions.map(({ label, icon, color, onPress }) => (
            <TouchableOpacity key={label} style={s.quickCard} onPress={onPress} activeOpacity={0.7}>
              <View style={[s.quickIcon, { backgroundColor: color + '18' }]}>
                <Ionicons name={icon as any} size={24} color={color} />
              </View>
              <Text style={s.quickLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Clubs nearby */}
        <Text style={s.sectionTitle}>Clubes disponibles</Text>
        {isLoading ? (
          <ActivityIndicator color="#16a34a" style={{ marginTop: 16 }} />
        ) : (
          clubs?.data?.map((club: any) => (
            <TouchableOpacity
              key={club.id}
              style={s.clubCard}
              onPress={() => router.push(`/club/${club.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={s.clubIconWrap}>
                <Ionicons name="business" size={22} color="#16a34a" />
              </View>
              <View style={s.clubInfo}>
                <Text style={s.clubName}>{club.name}</Text>
                <Text style={s.clubCity}>{club.profile?.city ?? 'Chile'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#16a34a', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24,
  },
  greeting: { fontSize: 15, color: '#bbf7d0', fontWeight: '500' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { padding: 16, paddingBottom: 24 },
  nextBanner: {
    backgroundColor: '#16a34a', borderRadius: 16, padding: 18, marginBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  nextBannerLeft: {},
  nextBannerLabel: { fontSize: 12, color: '#bbf7d0', fontWeight: '600', marginBottom: 4 },
  nextBannerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  nextBannerTime: { fontSize: 13, color: '#dcfce7', marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  quickCard: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  quickIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },
  clubCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  clubIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  clubInfo: { flex: 1 },
  clubName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  clubCity: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
