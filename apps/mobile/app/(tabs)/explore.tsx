import { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

export default function ExploreScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'clubs' | 'players'>('clubs');

  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ['clubs-explore'],
    queryFn: async () => { const { data } = await api.get('/clubs?limit=50'); return data; },
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ['players-explore', search],
    queryFn: async () => {
      const { data } = await api.get(`/players?search=${search}&limit=30`);
      return data;
    },
    enabled: tab === 'players',
  });

  const filteredClubs = clubs?.data?.filter((c: any) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Explorar</Text>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#9ca3af" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={tab === 'clubs' ? 'Buscar club...' : 'Buscar jugador...'}
            placeholderTextColor="#9ca3af"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {(['clubs', 'players'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'clubs' ? 'Clubes' : 'Jugadores'}
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
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/club/${club.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={s.cardIcon}>
                <Ionicons name="business" size={24} color="#16a34a" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{club.name}</Text>
                <Text style={s.cardSubtitle}>
                  {club.profile?.city ? `📍 ${club.profile.city}` : 'Chile'}
                </Text>
                {club.profile?.description && (
                  <Text style={s.cardDesc} numberOfLines={1}>{club.profile.description}</Text>
                )}
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
          ListEmptyComponent={
            playersLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No se encontraron jugadores</Text>
          }
          renderItem={({ item: player }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.8}>
              <View style={[s.cardIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="person" size={22} color="#7c3aed" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{player.playerProfile?.displayName}</Text>
                <Text style={s.cardSubtitle}>{player.playerProfile?.level ?? '—'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
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
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  tabs: { flexDirection: 'row', gap: 4, marginBottom: -1 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#16a34a' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#16a34a' },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
});
