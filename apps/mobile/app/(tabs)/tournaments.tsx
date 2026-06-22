import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth.store';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: '#6b7280' },
  REGISTRATION_OPEN: { label: 'Inscripción abierta', color: '#16a34a' },
  IN_PROGRESS: { label: 'En curso', color: '#d97706' },
  COMPLETED: { label: 'Finalizado', color: '#6b7280' },
  CANCELLED: { label: 'Cancelado', color: '#dc2626' },
};

export default function TournamentsScreen() {
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['tournaments-mobile'],
    queryFn: async () => { const { data } = await api.get('/tournaments'); return data; },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ tournamentId, categoryId }: { tournamentId: string; categoryId: string }) =>
      api.post(`/tournaments/${tournamentId}/register`, { categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments-mobile'] });
      Alert.alert('¡Éxito!', 'Te has inscrito al torneo.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo inscribir'),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Torneos</Text>
      </View>

      <FlatList
        data={tournaments ?? []}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
            : <View style={s.empty}><Ionicons name="trophy-outline" size={48} color="#d1d5db" /><Text style={s.emptyText}>No hay torneos disponibles</Text></View>
        }
        renderItem={({ item: t }) => {
          const status = STATUS_MAP[t.status] ?? { label: t.status, color: '#6b7280' };
          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.trophyWrap}>
                  <Ionicons name="trophy" size={22} color="#d97706" />
                </View>
                <View style={s.cardInfo}>
                  <Text style={s.cardTitle}>{t.name}</Text>
                  <Text style={s.cardClub}>{t.club?.name}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: status.color + '20' }]}>
                  <Text style={[s.badgeText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              <View style={s.cardDetails}>
                <View style={s.detailItem}>
                  <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                  <Text style={s.detailText}>
                    {format(new Date(t.startDate), 'd MMM', { locale: es })} – {format(new Date(t.endDate), 'd MMM yyyy', { locale: es })}
                  </Text>
                </View>
                {t.price > 0 && (
                  <View style={s.detailItem}>
                    <Ionicons name="card-outline" size={14} color="#6b7280" />
                    <Text style={s.detailText}>{formatCLP(t.price)} inscripción</Text>
                  </View>
                )}
              </View>

              {t.categories?.length > 0 && (
                <View style={s.categories}>
                  {t.categories.map((cat: any) => (
                    <View key={cat.id} style={s.catRow}>
                      <View style={s.catInfo}>
                        <Text style={s.catName}>{cat.name}</Text>
                        {cat.gender && <Text style={s.catSub}>{cat.gender === 'MALE' ? 'Masculino' : 'Femenino'}</Text>}
                      </View>
                      {t.status === 'REGISTRATION_OPEN' && user && (
                        <TouchableOpacity
                          style={s.registerBtn}
                          onPress={() => registerMutation.mutate({ tournamentId: t.id, categoryId: cat.id })}
                          disabled={registerMutation.isPending}
                        >
                          <Text style={s.registerBtnText}>Inscribirme</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  trophyWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fffbeb', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardClub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardDetails: { gap: 6, marginBottom: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: '#374151' },
  categories: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, gap: 8 },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catInfo: {},
  catName: { fontSize: 14, fontWeight: '600', color: '#374151' },
  catSub: { fontSize: 12, color: '#9ca3af' },
  registerBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  registerBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', marginTop: 12, fontSize: 14 },
});
