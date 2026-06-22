import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth.store';

const COURT_SURFACE_LABELS: Record<string, string> = {
  CLAY: 'Polvo de ladrillo',
  HARD: 'Dura',
  GRASS: 'Césped',
  ARTIFICIAL_GRASS: 'Césped artificial',
  CARPET: 'Moqueta',
  INDOOR: 'Indoor',
};

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'courts' | 'availability'>('info');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

  const { data: club, isLoading: clubLoading } = useQuery({
    queryKey: ['club-detail', id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: courts } = useQuery({
    queryKey: ['courts-mobile', id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${id}/courts`);
      return data;
    },
    enabled: !!id,
  });

  const { data: availability } = useQuery({
    queryKey: ['availability', selectedCourt, selectedDate],
    queryFn: async () => {
      const { data } = await api.get(`/courts/${selectedCourt}/availability?date=${selectedDate}`);
      return data;
    },
    enabled: !!selectedCourt && !!selectedDate,
  });

  const reserveMutation = useMutation({
    mutationFn: async (slot: { startTime: string; endTime: string }) => {
      const { data } = await api.post('/reservations', {
        courtId: selectedCourt,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', selectedCourt, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      Alert.alert('¡Reserva confirmada!', 'Tu cancha está reservada.');
    },
    onError: (err: any) =>
      Alert.alert('Error', err.response?.data?.message ?? 'No se pudo completar la reserva'),
  });

  const handleReserve = (slot: any) => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para reservar.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Iniciar sesión', onPress: () => router.push('/login') },
      ]);
      return;
    }
    Alert.alert(
      'Confirmar reserva',
      `Reservar ${format(new Date(slot.startTime), 'HH:mm')} – ${format(new Date(slot.endTime), 'HH:mm')}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reservar', onPress: () => reserveMutation.mutate(slot) },
      ],
    );
  };

  // Build next 7 days for date picker
  const nextDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  if (clubLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#16a34a" size="large" />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="business-outline" size={48} color="#d1d5db" />
        <Text style={{ color: '#9ca3af', marginTop: 12 }}>Club no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Hero header */}
      <View style={s.hero}>
        <TouchableOpacity onPress={() => router.back()} style={s.heroBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.heroIcon}>
          <Ionicons name="business" size={32} color="#16a34a" />
        </View>
        <Text style={s.heroName}>{club.name}</Text>
        {club.profile?.city && (
          <View style={s.heroLocation}>
            <Ionicons name="location-outline" size={14} color="#bbf7d0" />
            <Text style={s.heroCity}>{club.profile.city}</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['info', 'courts', 'availability'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'info' ? 'Info' : tab === 'courts' ? 'Canchas' : 'Reservar'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Info tab */}
        {activeTab === 'info' && (
          <View style={s.section}>
            {club.profile?.description && (
              <View style={s.infoCard}>
                <Text style={s.infoLabel}>Descripción</Text>
                <Text style={s.infoText}>{club.profile.description}</Text>
              </View>
            )}

            <View style={s.infoCard}>
              <Text style={s.infoLabel}>Contacto</Text>
              {club.profile?.phone && (
                <View style={s.infoRow}>
                  <Ionicons name="call-outline" size={16} color="#6b7280" />
                  <Text style={s.infoText}>{club.profile.phone}</Text>
                </View>
              )}
              {club.profile?.email && (
                <View style={s.infoRow}>
                  <Ionicons name="mail-outline" size={16} color="#6b7280" />
                  <Text style={s.infoText}>{club.profile.email}</Text>
                </View>
              )}
              {club.profile?.address && (
                <View style={s.infoRow}>
                  <Ionicons name="location-outline" size={16} color="#6b7280" />
                  <Text style={s.infoText}>{club.profile.address}</Text>
                </View>
              )}
              {club.profile?.website && (
                <View style={s.infoRow}>
                  <Ionicons name="globe-outline" size={16} color="#6b7280" />
                  <Text style={s.infoText}>{club.profile.website}</Text>
                </View>
              )}
            </View>

            {club.openingHours && club.openingHours.length > 0 && (
              <View style={s.infoCard}>
                <Text style={s.infoLabel}>Horarios</Text>
                {club.openingHours.map((oh: any) => (
                  <View key={oh.dayOfWeek} style={s.infoRow}>
                    <Text style={[s.infoText, { fontWeight: '600', width: 80 }]}>
                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][oh.dayOfWeek]}
                    </Text>
                    {oh.isClosed
                      ? <Text style={[s.infoText, { color: '#dc2626' }]}>Cerrado</Text>
                      : <Text style={s.infoText}>{oh.openTime} – {oh.closeTime}</Text>
                    }
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Courts tab */}
        {activeTab === 'courts' && (
          <View style={s.section}>
            {!courts || courts.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="tennisball-outline" size={40} color="#d1d5db" />
                <Text style={s.emptyText}>Sin canchas registradas</Text>
              </View>
            ) : (
              courts.map((court: any) => (
                <TouchableOpacity
                  key={court.id}
                  style={[s.courtCard, selectedCourt === court.id && s.courtCardSelected]}
                  onPress={() => { setSelectedCourt(court.id); setActiveTab('availability'); }}
                  activeOpacity={0.8}
                >
                  <View style={s.courtHeader}>
                    <View style={s.courtIconWrap}>
                      <Ionicons name="tennisball" size={20} color="#16a34a" />
                    </View>
                    <View style={s.courtInfo}>
                      <Text style={s.courtName}>{court.name}</Text>
                      <Text style={s.courtSurface}>
                        {COURT_SURFACE_LABELS[court.surface] ?? court.surface}
                        {court.isIndoor ? ' · Cubierta' : ' · Exterior'}
                      </Text>
                    </View>
                    {court.status === 'ACTIVE' ? (
                      <View style={s.courtBadge}>
                        <Text style={s.courtBadgeText}>Disponible</Text>
                      </View>
                    ) : (
                      <View style={[s.courtBadge, { backgroundColor: '#fef2f2' }]}>
                        <Text style={[s.courtBadgeText, { color: '#dc2626' }]}>No disponible</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.courtPrices}>
                    {court.pricePerHour && (
                      <Text style={s.priceText}>
                        Casual: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(court.pricePerHour)}/hr
                      </Text>
                    )}
                    {court.memberPricePerHour && (
                      <Text style={s.priceMember}>
                        Socio: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(court.memberPricePerHour)}/hr
                      </Text>
                    )}
                  </View>
                  <Text style={s.courtCTA}>Toca para reservar →</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Availability / Reserve tab */}
        {activeTab === 'availability' && (
          <View style={s.section}>
            {/* Court selector */}
            {courts && courts.length > 0 && (
              <View style={s.courtSelector}>
                <Text style={s.selectorLabel}>Cancha</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {courts.map((c: any) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.courtChip, selectedCourt === c.id && s.courtChipActive]}
                        onPress={() => setSelectedCourt(c.id)}
                      >
                        <Text style={[s.courtChipText, selectedCourt === c.id && s.courtChipTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Date picker */}
            <View style={s.datePicker}>
              <Text style={s.selectorLabel}>Fecha</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {nextDays.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDate === dayStr;
                    return (
                      <TouchableOpacity
                        key={dayStr}
                        style={[s.dateChip, isSelected && s.dateChipActive]}
                        onPress={() => setSelectedDate(dayStr)}
                      >
                        <Text style={[s.dateChipDay, isSelected && s.dateChipTextActive]}>
                          {format(day, 'EEE', { locale: es }).substring(0, 3)}
                        </Text>
                        <Text style={[s.dateChipNum, isSelected && s.dateChipTextActive]}>
                          {format(day, 'd')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {!selectedCourt ? (
              <View style={s.empty}>
                <Ionicons name="tennisball-outline" size={40} color="#d1d5db" />
                <Text style={s.emptyText}>Selecciona una cancha</Text>
              </View>
            ) : !availability ? (
              <ActivityIndicator color="#16a34a" style={{ marginTop: 32 }} />
            ) : (
              <View style={s.slots}>
                <Text style={s.slotsTitle}>
                  Disponibilidad — {format(new Date(selectedDate), "d 'de' MMMM", { locale: es })}
                </Text>
                {availability.length === 0 ? (
                  <View style={s.empty}>
                    <Text style={s.emptyText}>Sin horarios disponibles</Text>
                  </View>
                ) : (
                  availability.map((slot: any) => {
                    const startHour = format(new Date(slot.startTime), 'HH:mm');
                    const endHour = format(new Date(slot.endTime), 'HH:mm');
                    return (
                      <TouchableOpacity
                        key={slot.startTime}
                        style={[
                          s.slotCard,
                          !slot.available && s.slotCardUnavailable,
                        ]}
                        onPress={() => slot.available && handleReserve(slot)}
                        disabled={!slot.available || reserveMutation.isPending}
                        activeOpacity={slot.available ? 0.8 : 1}
                      >
                        <Text style={[s.slotTime, !slot.available && s.slotTimeUnavailable]}>
                          {startHour} – {endHour}
                        </Text>
                        {slot.available ? (
                          <View style={s.slotBadgeAvail}>
                            <Text style={s.slotBadgeAvailText}>Disponible</Text>
                          </View>
                        ) : (
                          <View style={s.slotBadgeOcc}>
                            <Text style={s.slotBadgeOccText}>Ocupado</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  hero: {
    backgroundColor: '#16a34a', paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroBack: {
    position: 'absolute', top: 56, left: 16, width: 36, height: 36,
    borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  heroIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  heroLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  heroCity: { fontSize: 13, color: '#bbf7d0' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#16a34a' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#16a34a' },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2, gap: 8 },
  infoLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },
  courtCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2, borderWidth: 2, borderColor: 'transparent' },
  courtCardSelected: { borderColor: '#16a34a' },
  courtHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  courtIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  courtInfo: { flex: 1 },
  courtName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  courtSurface: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  courtBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  courtBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  courtPrices: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  priceText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  priceMember: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  courtCTA: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9ca3af', marginTop: 12, fontSize: 14 },
  courtSelector: { marginBottom: 12 },
  datePicker: { marginBottom: 16 },
  selectorLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  courtChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb' },
  courtChipActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  courtChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  courtChipTextActive: { color: '#fff' },
  dateChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb', minWidth: 48 },
  dateChipActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  dateChipDay: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  dateChipNum: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  dateChipTextActive: { color: '#fff' },
  slots: { gap: 8 },
  slotsTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 4, textTransform: 'capitalize' },
  slotCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 1 },
  slotCardUnavailable: { backgroundColor: '#f9fafb', opacity: 0.7 },
  slotTime: { fontSize: 15, fontWeight: '700', color: '#111827' },
  slotTimeUnavailable: { color: '#9ca3af' },
  slotBadgeAvail: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  slotBadgeAvailText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  slotBadgeOcc: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  slotBadgeOccText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f3f4f6', borderRadius: 10 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
});
