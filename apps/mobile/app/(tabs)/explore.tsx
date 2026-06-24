import { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante', INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado', COMPETITIVE: 'Competitivo', PROFESSIONAL: 'Profesional',
};

export default function ExploreScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'clubs' | 'players' | 'invitations'>('clubs');
  const [commune, setCommune] = useState('');

  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ['clubs-explore'],
    queryFn: async () => { const { data } = await api.get('/clubs?limit=50'); return data; },
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ['players-search', commune],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30' });
      if (commune) params.set('comuna', commune);
      const { data } = await api.get(`/players/search?${params}`);
      return data;
    },
    enabled: tab === 'players',
  });

  const { data: invitations, isLoading: invLoading } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: async () => { const { data } = await api.get('/players/me/invitations'); return data; },
    enabled: tab === 'invitations',
  });

  const sendInvite = useMutation({
    mutationFn: (userId: string) => api.post(`/players/${userId}/invite`),
    onSuccess: () => { Alert.alert('Invitación enviada', '¡Tu invitación fue enviada!'); qc.invalidateQueries({ queryKey: ['my-invitations'] }); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar la invitación'),
  });

  const acceptInvite = useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Error'),
  });

  const declineInvite = useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/decline`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
  });

  const filteredClubs = clubs?.data?.filter((c: any) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  const pendingReceived = invitations?.received?.filter((i: any) => i.status === 'PENDING') ?? [];
  const accepted = invitations?.received?.filter((i: any) => i.status === 'ACCEPTED') ?? [];
  const sent = invitations?.sent ?? [];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Explorar</Text>
        {tab !== 'invitations' && (
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={18} color="#9ca3af" style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              value={tab === 'players' ? commune : search}
              onChangeText={tab === 'players' ? setCommune : setSearch}
              placeholder={tab === 'clubs' ? 'Buscar club...' : 'Filtrar por comuna...'}
              placeholderTextColor="#9ca3af"
            />
          </View>
        )}
        <View style={s.tabs}>
          {(['clubs', 'players', 'invitations'] as const).map(t => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'clubs' ? 'Clubes' : t === 'players' ? 'Jugadores' : 'Invitaciones'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'clubs' && (
        <FlatList
          data={filteredClubs}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            clubsLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No se encontraron clubes</Text>
          }
          renderItem={({ item: club }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/club/${club.id}` as any)} activeOpacity={0.8}>
              <View style={s.cardIcon}>
                <Ionicons name="business" size={24} color="#16a34a" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{club.name}</Text>
                <Text style={s.cardSubtitle}>{club.profile?.city ? `📍 ${club.profile.city}` : 'Chile'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          )}
        />
      )}

      {tab === 'players' && (
        <FlatList
          data={players?.data ?? []}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            players?.data?.length === 0 && !playersLoading
              ? null
              : <Text style={s.sectionNote}>Jugadores disponibles para partido</Text>
          }
          ListEmptyComponent={
            playersLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No hay jugadores disponibles con estos filtros</Text>
          }
          renderItem={({ item: p }) => (
            <View style={s.card}>
              <View style={[s.cardIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="person" size={22} color="#7c3aed" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{p.displayName}</Text>
                <Text style={s.cardSubtitle}>
                  {LEVEL_LABELS[p.level] ?? p.level}
                  {p.comuna ? ` · ${p.comuna}` : ''}
                </Text>
                {p.availableWeekdays && <Text style={s.tag}>Días de semana</Text>}
                {p.availableWeekends && <Text style={s.tag}>Fines de semana</Text>}
              </View>
              <TouchableOpacity
                style={s.inviteBtn}
                onPress={() => sendInvite.mutate(p.user.id)}
                disabled={sendInvite.isPending}
              >
                <Text style={s.inviteBtnText}>Invitar</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {tab === 'invitations' && (
        <FlatList
          data={[
            ...pendingReceived.map((i: any) => ({ ...i, _section: 'received' })),
            ...accepted.map((i: any) => ({ ...i, _section: 'accepted' })),
            ...sent.map((i: any) => ({ ...i, _section: 'sent' })),
          ]}
          keyExtractor={(item: any) => item.id + item._section}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            invLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No tienes invitaciones</Text>
          }
          renderItem={({ item: inv }) => (
            <View style={s.invCard}>
              {inv._section === 'received' && (
                <>
                  <Text style={s.invTitle}>
                    <Text style={s.invName}>{inv.requester?.displayName}</Text> te invitó a jugar
                  </Text>
                  <Text style={s.invSub}>Nivel: {LEVEL_LABELS[inv.requester?.level] ?? inv.requester?.level}</Text>
                  <View style={s.invActions}>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => acceptInvite.mutate(inv.id)}>
                      <Text style={s.acceptBtnText}>Aceptar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.declineBtn} onPress={() => declineInvite.mutate(inv.id)}>
                      <Text style={s.declineBtnText}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {inv._section === 'accepted' && (
                <>
                  <Text style={s.invTitle}>
                    Partido aceptado con <Text style={s.invName}>{inv.requester?.displayName}</Text>
                  </Text>
                  {inv.requester?.phone && (
                    <Text style={s.phoneText}>📞 {inv.requester.phone}</Text>
                  )}
                </>
              )}
              {inv._section === 'sent' && (
                <>
                  <Text style={s.invTitle}>
                    Invitación enviada a <Text style={s.invName}>{inv.recipient?.displayName}</Text>
                  </Text>
                  <Text style={[s.invSub, { color: inv.status === 'ACCEPTED' ? '#16a34a' : inv.status === 'DECLINED' ? '#dc2626' : '#d97706' }]}>
                    {inv.status === 'PENDING' ? 'Pendiente' : inv.status === 'ACCEPTED' ? 'Aceptada' : 'Rechazada'}
                  </Text>
                </>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  tabs: { flexDirection: 'row', gap: 0, marginBottom: -1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#16a34a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#16a34a' },
  sectionNote: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  tag: { fontSize: 11, color: '#16a34a', marginTop: 3 },
  inviteBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  inviteBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  invCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  invTitle: { fontSize: 14, color: '#374151', lineHeight: 20 },
  invName: { fontWeight: '700', color: '#111827' },
  invSub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  invActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  phoneText: { fontSize: 14, fontWeight: '600', color: '#16a34a', marginTop: 6 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
});
