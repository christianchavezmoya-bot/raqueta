import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

const { width: SW } = Dimensions.get('window');

export default function EstadisticasScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ['my-stats', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return null;
      const { data } = await api.get(`/clubs/${firstClubId}/seasons/current/my-stats`);
      return data;
    },
    enabled: !!firstClubId,
  });

  const winRate   = stats?.winRate   ?? 71.4;
  const played    = stats?.matchesPlayed ?? 7;
  const wins      = stats?.wins ?? 5;
  const losses    = stats?.losses ?? 2;
  const evolution: Array<{ label: string; pts: number }> = stats?.pointsEvolution ?? PLACEHOLDER_EVOLUTION;
  const byCategory: Array<{ category: string; winRate: number }> = stats?.winRateByCategory ?? PLACEHOLDER_BY_CAT;

  const maxPts = Math.max(...evolution.map(e => e.pts), 1);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Estadísticas</Text>
          <Text style={s.headerSub}>Tu rendimiento esta temporada</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* 2×2 stats grid */}
          <View style={s.grid}>
            <StatCell label="Win Rate" value={`${winRate.toFixed(1)}%`} color={GREEN} />
            <StatCell label="Partidos" value={played.toString()} />
            <StatCell label="Victorias" value={wins.toString()} color={GREEN} />
            <StatCell label="Derrotas"  value={losses.toString()} color={RED} />
          </View>

          {/* Points evolution chart */}
          <View style={s.chartCard}>
            <Text style={s.chartTitle}>Evolución de puntos</Text>
            <View style={s.chartArea}>
              {evolution.map((e, i) => {
                const barH = Math.max(8, (e.pts / maxPts) * 120);
                return (
                  <View key={i} style={s.barGroup}>
                    <View style={[s.bar, { height: barH, backgroundColor: GOLD }]} />
                    <Text style={s.barLabel}>{e.label}</Text>
                  </View>
                );
              })}
            </View>
            {/* Y-axis labels hint */}
            <View style={s.chartFooter}>
              <Text style={s.chartNote}>Puntos acumulados por partido</Text>
            </View>
          </View>

          {/* Win % by category */}
          <View style={s.catCard}>
            <Text style={s.sectionTitle}>% Victorias por categoría</Text>
            {byCategory.map((cat, i) => (
              <View key={i} style={s.catRow}>
                <Text style={s.catLabel}>{cat.category}</Text>
                <View style={s.catBarBg}>
                  <View style={[s.catBarFill, { width: `${cat.winRate}%` }]} />
                </View>
                <Text style={s.catPct}>{cat.winRate.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={sc.cell}>
      <Text style={[sc.value, color ? { color } : {}]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  cell: {
    width: '48%', backgroundColor: '#111827', borderRadius: 16, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: '#1f2937',
  },
  value: { fontSize: 32, fontWeight: '800', color: '#f9fafb' },
  label: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontWeight: '600' },
});

const PLACEHOLDER_EVOLUTION = [
  { label: 'R1', pts: 3800 }, { label: 'R2', pts: 4100 }, { label: 'R3', pts: 3900 },
  { label: 'R4', pts: 4500 }, { label: 'R5', pts: 5200 }, { label: 'R6', pts: 9811 },
];
const PLACEHOLDER_BY_CAT = [
  { category: '1RA División', winRate: 80 },
  { category: '2DA División', winRate: 60 },
  { category: 'Desafíos',     winRate: 75 },
];

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
  scroll: { padding: 20, paddingBottom: 48, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },

  chartCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 16 },
  chartArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140,
    borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 4,
  },
  barGroup: { flex: 1, alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 4, minHeight: 8 },
  barLabel: { fontSize: 10, color: SUB, fontWeight: '600' },
  chartFooter: { marginTop: 8 },
  chartNote: { fontSize: 11, color: SUB },

  catCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER, gap: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catLabel: { width: 110, fontSize: 12, color: SUB, fontWeight: '600' },
  catBarBg: { flex: 1, height: 8, backgroundColor: BORDER, borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: GOLD, borderRadius: 4 },
  catPct: { width: 36, fontSize: 12, fontWeight: '700', color: TEXT, textAlign: 'right' },
});
