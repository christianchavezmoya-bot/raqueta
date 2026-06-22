import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const { data: me } = useQuery({
    queryKey: ['me-profile'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });

  const { data: myReservations } = useQuery({
    queryKey: ['my-reservations-profile'],
    queryFn: async () => { const { data } = await api.get('/users/me/reservations?limit=5'); return data; },
  });

  const { data: myPayments } = useQuery({
    queryKey: ['my-payments-profile'],
    queryFn: async () => { const { data } = await api.get('/users/me/payments'); return data; },
  });

  const profile = me?.playerProfile;
  const stats = profile?.stats;

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const LEVEL_LABELS: Record<string, string> = {
    BEGINNER: 'Principiante',
    INTERMEDIATE: 'Intermedio',
    ADVANCED: 'Avanzado',
    COMPETITIVE: 'Competitivo',
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Profile header */}
      <View style={s.profileHeader}>
        <View style={s.avatarLarge}>
          <Text style={s.avatarText}>
            {(profile?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={s.displayName}>{profile?.displayName ?? 'Tu perfil'}</Text>
        <Text style={s.email}>{me?.email}</Text>
        <View style={s.levelBadge}>
          <Text style={s.levelText}>{LEVEL_LABELS[profile?.level] ?? 'Principiante'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Partidos', value: stats?.matchesPlayed ?? 0 },
          { label: 'Victorias', value: stats?.wins ?? 0 },
          { label: 'Puntos', value: stats?.rankingPoints ?? 0 },
        ].map(({ label, value }) => (
          <View key={label} style={s.statItem}>
            <Text style={s.statValue}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Upcoming reservations */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Mis reservas recientes</Text>
        {myReservations?.data?.length === 0 ? (
          <Text style={s.emptyText}>Sin reservas</Text>
        ) : (
          myReservations?.data?.slice(0, 3).map((r: any) => (
            <View key={r.id} style={s.itemCard}>
              <View style={s.itemIcon}>
                <Ionicons name="tennisball-outline" size={18} color="#16a34a" />
              </View>
              <View style={s.itemInfo}>
                <Text style={s.itemTitle}>{r.court?.name}</Text>
                <Text style={s.itemSub}>
                  {new Date(r.startTime).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  {' · '}{new Date(r.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={[s.statusDot, { backgroundColor: r.status === 'CONFIRMED' ? '#16a34a' : '#d97706' }]} />
            </View>
          ))
        )}
      </View>

      {/* Menu */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Mi cuenta</Text>
        {[
          { label: 'Editar perfil', icon: 'person-outline', onPress: () => {} },
          { label: 'Mis pagos', icon: 'card-outline', onPress: () => {} },
          { label: 'Mis membresías', icon: 'shield-checkmark-outline', onPress: () => {} },
          { label: 'Notificaciones', icon: 'notifications-outline', onPress: () => {} },
        ].map(({ label, icon, onPress }) => (
          <TouchableOpacity key={label} style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
            <Ionicons name={icon as any} size={20} color="#374151" />
            <Text style={s.menuLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  profileHeader: { backgroundColor: '#16a34a', alignItems: 'center', paddingTop: 60, paddingBottom: 28, paddingHorizontal: 20 },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  displayName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  email: { fontSize: 14, color: '#bbf7d0', marginTop: 4 },
  levelBadge: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  levelText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 18, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  section: { margin: 16, marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  menuLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca', marginBottom: 8 },
  logoutText: { fontSize: 15, color: '#dc2626', fontWeight: '600' },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
});
