import type { ComponentProps } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

const TYPE_LABELS: Record<string, string> = {
  MATCH: 'Partido',
  PRACTICE: 'Partido casual',
  TRAINING: 'Entrenamiento',
  COACHING: 'Coaching',
  FITNESS: 'Físico',
};
const TYPE_COLORS: Record<string, string> = {
  MATCH: '#16a34a',
  PRACTICE: '#2563eb',
  TRAINING: '#0284c7',
  COACHING: '#d97706',
  FITNESS: '#7c3aed',
};

function isScoredMatch(type: string) {
  return type === 'MATCH' || type === 'PRACTICE';
}

function iconForType(type: string): ComponentProps<typeof Ionicons>['name'] {
  if (type === 'MATCH') return 'tennisball';
  if (type === 'PRACTICE') return 'flash';
  if (type === 'TRAINING') return 'barbell';
  if (type === 'COACHING') return 'school';
  return 'body';
}

function scoreSummary(setsData: any[] | null | undefined) {
  if (!Array.isArray(setsData) || setsData.length === 0) return null;
  return setsData.map((set: any) => `${set.myGames}-${set.opponentGames}`).join(' · ');
}

export default function MatchLogScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['match-log'],
    queryFn: async () => { const { data } = await api.get('/players/me/match-log'); return data; },
  });

  const entries = data?.data ?? [];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>Mi registro de partidos</Text>
        <TouchableOpacity onPress={() => router.push('/match-log/add' as any)} style={s.addBtn}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="clipboard-outline" size={48} color="#d1d5db" />
          <Text style={s.emptyTitle}>Sin entradas</Text>
          <Text style={s.emptyText}>Empieza registrando tu primer partido</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/match-log/add' as any)}>
            <Text style={s.emptyBtnText}>Agregar partido</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/match-log/${item.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={[s.typeTag, { backgroundColor: (TYPE_COLORS[item.type] ?? '#6b7280') + '18' }]}>
                <Ionicons
                  name={iconForType(item.type)}
                  size={20}
                  color={TYPE_COLORS[item.type] ?? '#6b7280'}
                />
              </View>
              <View style={s.cardInfo}>
                <View style={s.cardRow}>
                  <Text style={s.cardType}>{TYPE_LABELS[item.type] ?? item.type}</Text>
                  {isScoredMatch(item.type) && item.playerWon !== null && item.playerWon !== undefined && (
                    <View style={[s.resultBadge, { backgroundColor: item.playerWon ? '#dcfce7' : '#fee2e2' }]}>
                      <Text style={[s.resultText, { color: item.playerWon ? '#15803d' : '#dc2626' }]}>
                        {item.playerWon ? 'Victoria' : 'Derrota'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardDate}>
                  {new Date(item.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {(item.opponent?.displayName ?? item.opponentName) && (
                  <Text style={s.cardOpponent}>vs. {item.opponent?.displayName ?? item.opponentName}</Text>
                )}
                {scoreSummary(item.setsData) && <Text style={s.cardScore}>{scoreSummary(item.setsData)}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  addBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  typeTag: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardType: { fontSize: 14, fontWeight: '700', color: '#111827' },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  resultText: { fontSize: 11, fontWeight: '700' },
  cardDate: { fontSize: 12, color: '#6b7280' },
  cardOpponent: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  cardScore: { fontSize: 12, color: '#374151', fontWeight: '600', marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  emptyBtn: { marginTop: 12, backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
