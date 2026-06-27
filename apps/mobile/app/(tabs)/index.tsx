import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as Location from 'expo-location';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();

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

  const toggleAvail = useMutation({
    mutationFn: (payload: any) => api.patch('/players/me/availability', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['me-profile'] }); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo actualizar'),
  });

  const profile = me?.playerProfile;
  const isAvailable = profile?.availableForMatch ?? false;
  const nextReservation = myReservations?.data?.[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const [availDuration, setAvailDuration] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const updateDuration = () => {
      if (!isAvailable || !profile?.locationUpdatedAt) { setAvailDuration(''); return; }
      const mins = Math.floor((Date.now() - new Date(profile.locationUpdatedAt).getTime()) / 60000);
      setAvailDuration(mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
    };
    updateDuration();
    if (isAvailable) {
      intervalRef.current = setInterval(updateDuration, 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAvailable, profile?.locationUpdatedAt]);

  const handleAvailabilityPress = () => {
    if (toggleAvail.isPending) return;

    if (isAvailable) {
      toggleAvail.mutate({ availableForMatch: false });
      return;
    }

    Alert.alert(
      'Ubicación temporal',
      'Tu ubicación se usará solo mientras actives "Disponible" para buscar rivales cercanos. Al apagarlo se elimina de inmediato.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
              Alert.alert('Permiso requerido', 'Necesitamos tu ubicación actual para mostrarte solo mientras estés disponible.');
              return;
            }

            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });

            toggleAvail.mutate({
              availableForMatch: true,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          },
        },
      ],
    );
  };

  const quickActions = [
    { label: 'Reservar cancha', icon: 'tennisball', color: '#1b4a86', onPress: () => router.push('/(tabs)/explore') },
    { label: 'Ver torneos', icon: 'trophy', color: '#d97706', onPress: () => router.push('/(tabs)/tournaments') },
    { label: 'Buscar jugadores', icon: 'people', color: '#0284c7', onPress: () => router.push('/(tabs)/explore') },
    { label: 'Mi log', icon: 'clipboard', color: '#7c3aed', onPress: () => router.push('/(tabs)/profile') },
  ];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting},</Text>
          <Text style={s.name}>{profile?.displayName ?? user?.email?.split('@')[0] ?? 'Jugador'} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Availability quick-toggle */}
          <TouchableOpacity
            onPress={handleAvailabilityPress}
            style={[s.availBtn, isAvailable && s.availBtnOn]}
            disabled={toggleAvail.isPending}
          >
            {toggleAvail.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[s.availBtnText, isAvailable && s.availBtnTextOn]}>{isAvailable ? `● Disponible${availDuration ? ` · ${availDuration}` : ''}` : 'Disponible'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={s.avatar}>
            <Text style={s.avatarText}>
              {(profile?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
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
          <ActivityIndicator color="#1b4a86" style={{ marginTop: 16 }} />
        ) : (
          clubs?.data?.map((club: any) => (
            <TouchableOpacity
              key={club.id}
              style={s.clubCard}
              onPress={() => router.push(`/club/${club.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={s.clubIconWrap}>
                <Ionicons name="business" size={22} color="#1b4a86" />
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
    backgroundColor: '#1b4a86', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24,
  },
  greeting: { fontSize: 15, color: '#93b9e8', fontWeight: '500' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  availBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  availBtnOn: { backgroundColor: '#e5ff2c', borderColor: '#e5ff2c' },
  availBtnText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  availBtnTextOn: { color: '#1b4a86' },
  scroll: { padding: 16, paddingBottom: 24 },
  nextBanner: {
    backgroundColor: '#1b4a86', borderRadius: 16, padding: 18, marginBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  nextBannerLeft: {},
  nextBannerLabel: { fontSize: 12, color: '#93b9e8', fontWeight: '600', marginBottom: 4 },
  nextBannerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  nextBannerTime: { fontSize: 13, color: '#bfdbfe', marginTop: 4 },
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
  clubIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  clubInfo: { flex: 1 },
  clubName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  clubCity: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
