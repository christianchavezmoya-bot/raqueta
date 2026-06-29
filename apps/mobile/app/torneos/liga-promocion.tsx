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

const TABS = ['TABLA', 'PARTIDOS'];

export default function LigaPromocionScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeTab, setActiveTab] = useState('TABLA');

  const { data: liga, isLoading } = useQuery({
    queryKey: ['liga-promocion', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return null;
      const { data } = await api.get(`/clubs/${firstClubId}/liga-promocion`);
      return data;
    },
    enabled: !!firstClubId,
  });

  const standings: any[] = liga?.standings ?? PLACEHOLDER_STANDINGS;
  const matches: any[] = liga?.matches ?? [];

  const promotionCount = liga?.promotionCount ?? 2;
  const relegationCount = liga?.relegationCount ?? 1;
  const totalPlayers = standings.length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Liga Promoción</Text>
          <Text style={s.headerSub}>Ascenso y descenso de categoría</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: GREEN }]} /><Text style={s.legendText}>Asciende</Text></View>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: RED }]} /><Text style={s.legendText}>Desciende</Text></View>
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
        ) : activeTab === 'TABLA' ? (
          <StandingsTable
            standings={standings}
            promotionCount={promotionCount}
            relegationCount={relegationCount}
          />
        ) : (
          <MatchList matches={matches} onPress={(id) => router.push(`/torneos/partido/${id}` as any)} />
        )}
      </ScrollView>
    </View>
  );
}

function StandingsTable({ standings, promotionCount, relegationCount }: {
  standings: any[];
  promotionCount: number;
  relegationCount: number;
}) {
  const total = standings.length;
  return (
    <View style={st.table}>
      {/* Header */}
      <View style={st.head}>
        <Text style={[st.headCell, { flex: 0.5 }]}>POS</Text>
        <Text style={[st.headCell, { flex: 3 }]}>JUGADOR</Text>
        <Text style={[st.headCell, { flex: 0.7, textAlign: 'center' }]}>PJ</Text>
        <Text style={[st.headCell, { flex: 0.7, textAlign: 'center' }]}>W</Text>
        <Text style={[st.headCell, { flex: 1, textAlign: 'right' }]}>PTS</Text>
      </View>

      {standings.map((p: any, i: number) => {
        const isPromotion = i < promotionCount;
        const isRelegation = i >= total - relegationCount;
        const rowBg = isPromotion ? '#22c55e14' : isRelegation ? '#ef444414' : 'transparent';
        const textColor = isPromotion ? GREEN : isRelegation ? RED : TEXT;

        return (
          <View key={p.rosterId ?? i} style={[st.row, { backgroundColor: rowBg }]}>
            <View style={[st.posBadge, { flex: 0.5 }, isPromotion && st.posBadgeGreen, isRelegation && st.posBadgeRed]}>
              <Text style={[st.posText, { color: textColor }]}>{i + 1}</Text>
            </View>
            <Text style={[st.name, { flex: 3, color: textColor }]} numberOfLines={1}>{p.playerName ?? 'Jugador'}</Text>
            <Text style={[st.cell, { flex: 0.7 }]}>{p.pj ?? 0}</Text>
            <Text style={[st.cell, { flex: 0.7 }]}>{p.w ?? 0}</Text>
            <Text style={[st.pts, { flex: 1, color: textColor }]}>{p.pts ?? 0}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MatchList({ matches, onPress }: { matches: any[]; onPress: (id: string) => void }) {
  if (matches.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="calendar-outline" size={36} color={SUB} />
        <Text style={s.emptyText}>Sin partidos registrados</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {matches.map((m: any, i: number) => {
        const isPast = new Date(m.scheduledAt ?? m.playedAt ?? 0).getTime() < Date.now();
        return (
          <TouchableOpacity
            key={m.id ?? i}
            style={ml.card}
            onPress={() => m.id && onPress(m.id)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={ml.label}>{isPast ? 'Partido jugado' : 'Próximo partido'}</Text>
              <Text style={ml.players}>{m.player1Name ?? 'J1'} vs {m.player2Name ?? 'J2'}</Text>
              {m.scoreLabel && <Text style={ml.score}>{m.scoreLabel}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={SUB} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const PLACEHOLDER_STANDINGS = [
  { playerName: 'Raúl Méndez',   pj: 5, w: 5, pts: 15 },
  { playerName: 'David Castillo', pj: 5, w: 4, pts: 12 },
  { playerName: 'Rafael Labbe',  pj: 5, w: 3, pts: 9 },
  { playerName: 'Matías García', pj: 5, w: 2, pts: 6 },
  { playerName: 'Rodrigo Vera',  pj: 5, w: 0, pts: 0 },
];

const st = StyleSheet.create({
  table: { backgroundColor: '#111827', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' },
  head: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headCell: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.4 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  posBadge: { justifyContent: 'center' },
  posBadgeGreen: {},
  posBadgeRed: {},
  posText: { fontSize: 14, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '600' },
  cell: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  pts: { fontSize: 14, fontWeight: '800', textAlign: 'right' },
});

const ml = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  label: { fontSize: 11, color: '#d4a017', fontWeight: '700' },
  players: { fontSize: 14, fontWeight: '700', color: '#f9fafb', marginTop: 2 },
  score: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
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
  legend: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: SUB },
  tabsRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: GOLD },
  tabText: { fontSize: 13, fontWeight: '700', color: SUB },
  tabTextActive: { color: GOLD },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  empty: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, color: SUB },
});
