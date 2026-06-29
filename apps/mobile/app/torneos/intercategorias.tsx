import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

const TABS = ['RESULTADOS', 'RANKING'];

const CATEGORY_COLORS: Record<string, string> = {
  '1RA': '#7c3aed', '2DA': '#1b4a86', '3RA': '#16a34a', '4TA': '#d97706', '5TA': '#0284c7',
};

export default function IntercategoriasScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeTab, setActiveTab] = useState('RESULTADOS');

  const { data: results, isLoading: loadingResults } = useQuery({
    queryKey: ['intercategorias-results', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/match-results?source=INTERCATEGORIA&limit=30`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId && activeTab === 'RESULTADOS',
  });

  const { data: ranking, isLoading: loadingRanking } = useQuery({
    queryKey: ['intercategorias-ranking', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId && activeTab === 'RANKING',
  });

  const isLoading = activeTab === 'RESULTADOS' ? loadingResults : loadingRanking;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Intercategorías</Text>
          <Text style={s.headerSub}>Cruces entre categorías diferentes</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, activeTab === t && s.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[s.tabText, activeTab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : activeTab === 'RESULTADOS' ? (
          <ResultadosTab
            results={results ?? PLACEHOLDER_RESULTS}
            onPress={(id) => router.push(`/torneos/partido/${id}` as any)}
          />
        ) : (
          <RankingTab entries={ranking ?? []} />
        )}
      </ScrollView>
    </View>
  );
}

function CategoryTag({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? '#6b7280';
  return (
    <View style={[ct.tag, { backgroundColor: color + '33', borderColor: color }]}>
      <Text style={[ct.text, { color }]}>{category}</Text>
    </View>
  );
}
const ct = StyleSheet.create({
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '800' },
});

function ResultadosTab({ results, onPress }: { results: any[]; onPress: (id: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      {results.map((r: any, i: number) => {
        const won = r.result === 'WIN' || r.playerWon;
        const pts = r.pointsAwarded ?? r.pointsEarned ?? 0;

        return (
          <TouchableOpacity
            key={r.id ?? i}
            style={ic.card}
            onPress={() => r.id && onPress(r.id)}
            activeOpacity={0.8}
          >
            {/* Player row */}
            <View style={ic.topRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={ic.playerName}>{r.myName ?? r.player1Name ?? 'Tú'}</Text>
                <CategoryTag category={r.myCategory ?? r.player1Category ?? '1RA'} />
              </View>
              <Text style={ic.vs}>VS</Text>
              <View style={{ flex: 1, gap: 4, alignItems: 'flex-end' }}>
                <Text style={ic.playerName}>{r.opponentName ?? r.player2Name ?? 'Oponente'}</Text>
                <CategoryTag category={r.opponentCategory ?? r.player2Category ?? '2DA'} />
              </View>
            </View>

            {/* Result row */}
            <View style={ic.resultRow}>
              <View style={[ic.resultBadge, won ? ic.resultWin : ic.resultLoss]}>
                <Text style={[ic.resultText, { color: won ? GREEN : RED }]}>
                  {won ? 'Ganaste' : 'Perdiste'}
                </Text>
              </View>
              <Text style={ic.score}>{r.scoreLabel ?? (r.sets ? r.sets.map((s: any) => `${s.p1}-${s.p2}`).join(' ') : '—')}</Text>
              <Text style={[ic.pts, { color: won ? GREEN : RED }]}>
                {won ? `+${pts}` : `-${pts}`} pts
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Regla visual */}
      <View style={ic.ruleCard}>
        <Ionicons name="information-circle" size={18} color={GOLD} style={{ marginBottom: 6 }} />
        <Text style={ic.ruleTitle}>Regla intercategorías</Text>
        <Text style={ic.ruleText}>
          Al vencer a un jugador de categoría superior, obtienes puntos adicionales.
          Al perder contra uno inferior, pierdes puntos adicionales.
          Estos resultados no afectan el cuadro principal del torneo.
        </Text>
      </View>
    </View>
  );
}

function RankingTab({ entries }: { entries: any[] }) {
  return (
    <View style={{ gap: 8 }}>
      {entries.map((e: any, i: number) => {
        const name = e.rosterEntry?.linkedPlayerProfile?.displayName
          ?? `${e.rosterEntry?.firstName ?? ''} ${e.rosterEntry?.lastName ?? ''}`.trim()
          ?? 'Jugador';
        const division = e.rosterEntry?.division ?? '—';
        const pts = e.totalPoints ?? 0;
        const isFirst = i === 0;
        return (
          <View key={e.id ?? i} style={[ic.rankRow, isFirst && { backgroundColor: '#1a2235' }]}>
            <Text style={[ic.rankNum, isFirst && { color: GOLD }]}>#{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ic.rankName} numberOfLines={1}>{name}</Text>
              <CategoryTag category={division} />
            </View>
            <Text style={[ic.rankPts, isFirst && { color: GOLD }]}>{pts.toLocaleString('es-CL')}</Text>
          </View>
        );
      })}
    </View>
  );
}

const PLACEHOLDER_RESULTS = [
  { myName: 'Raúl Méndez', myCategory: '2DA', opponentName: 'Rafael Labbe', opponentCategory: '1RA', result: 'WIN', pointsEarned: 45, scoreLabel: '6-4 7-5' },
  { myName: 'Raúl Méndez', myCategory: '2DA', opponentName: 'David C.',     opponentCategory: '3RA', result: 'LOSS', pointsEarned: 15, scoreLabel: '4-6 3-6' },
];

const ic = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16, gap: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { fontSize: 14, fontWeight: '700', color: '#f9fafb' },
  vs: { fontSize: 12, fontWeight: '800', color: '#6b7280', width: 24, textAlign: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  resultWin: { backgroundColor: '#22c55e22', borderColor: '#22c55e' },
  resultLoss: { backgroundColor: '#ef444422', borderColor: '#ef4444' },
  resultText: { fontSize: 12, fontWeight: '700' },
  score: { flex: 1, fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  pts: { fontSize: 14, fontWeight: '800' },
  ruleCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#d4a01744', marginTop: 4,
  },
  ruleTitle: { fontSize: 13, fontWeight: '700', color: '#f9fafb', marginBottom: 6 },
  ruleText: { fontSize: 12, color: '#9ca3af', lineHeight: 18 },
  rankRow: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#1f2937',
  },
  rankNum: { fontSize: 13, fontWeight: '800', color: '#9ca3af', width: 28 },
  rankName: { fontSize: 14, fontWeight: '600', color: '#f9fafb' },
  rankPts: { fontSize: 14, fontWeight: '800', color: '#f9fafb' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TEXT },
  headerSub: { fontSize: 12, color: SUB },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: GOLD },
  tabText: { fontSize: 13, fontWeight: '700', color: SUB },
  tabTextActive: { color: GOLD },
  scroll: { padding: 16, paddingBottom: 48, gap: 10 },
});
