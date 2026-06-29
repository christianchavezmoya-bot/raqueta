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
const SUB = '#9ca3af'; const BORDER = '#1f2937'; const ROW_HL = '#1a2235';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

const AVATAR_COLORS = ['#1b4a86','#16a34a','#7c3aed','#d97706','#0284c7','#dc2626'];

function AvatarBubble({ name, size = 32 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <View style={[s.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[idx] }]}>
      <Text style={[s.bubbleText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const TABS = ['GENERAL', '1RA', '2DA', '3RA', '4TA', '5TA'];

export default function RankingGeneralScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeTab, setActiveTab] = useState('GENERAL');

  const { data: entries, isLoading } = useQuery({
    queryKey: ['ranking-internal', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId,
  });

  // Breakdown for the top player
  const { data: breakdown } = useQuery({
    queryKey: ['ranking-breakdown', firstClubId, entries?.[0]?.rosterEntry?.id],
    queryFn: async () => {
      if (!firstClubId || !entries?.[0]?.rosterEntry?.id) return null;
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/breakdown?rosterId=${entries[0].rosterEntry.id}`);
      return data;
    },
    enabled: !!firstClubId && !!entries?.length,
  });

  const filtered = activeTab === 'GENERAL'
    ? (entries ?? [])
    : (entries ?? []).filter((e: any) => e.rosterEntry?.division === activeTab);

  const leader = filtered[0];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Ranking General</Text>
          <Text style={s.headerSub}>General, categorías y puntos</Text>
        </View>
      </View>

      {/* Division tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsBar} contentContainerStyle={s.tabsContent}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tabPill, activeTab === tab && s.tabPillActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Leaderboard table */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { flex: 0.4 }]}>#</Text>
            <Text style={[s.tableHeadCell, { flex: 3 }]}>JUGADOR</Text>
            <Text style={[s.tableHeadCell, { flex: 1.2, textAlign: 'right' }]}>PTS</Text>
            <Text style={[s.tableHeadCell, { flex: 1, textAlign: 'right' }]}>VAR</Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color={GOLD} style={{ padding: 24 }} />
          ) : filtered.length === 0 ? (
            <Text style={s.emptyText}>Sin jugadores en esta categoría</Text>
          ) : (
            filtered.map((entry: any, idx: number) => {
              const name = entry.rosterEntry?.linkedPlayerProfile?.displayName
                ?? `${entry.rosterEntry?.firstName ?? ''} ${entry.rosterEntry?.lastName ?? ''}`.trim()
                ?? 'Jugador';
              const pts = entry.totalPoints ?? 0;
              const movement = entry.movement ?? 0;
              const isFirst = idx === 0;

              return (
                <View key={entry.id} style={[s.tableRow, isFirst && s.tableRowHighlight]}>
                  <Text style={[s.rankNum, { flex: 0.4 }, isFirst && { color: GOLD }]}>{entry.rank ?? idx + 1}</Text>
                  <View style={[s.playerCell, { flex: 3 }]}>
                    <AvatarBubble name={name} size={32} />
                    <Text style={[s.playerName, isFirst && { color: GOLD }]} numberOfLines={1}>{name}</Text>
                  </View>
                  <Text style={[s.ptsNum, { flex: 1.2 }, isFirst && { color: GOLD }]}>
                    {pts.toLocaleString('es-CL')}
                  </Text>
                  <Text style={[s.varNum, { flex: 1 }, movement > 0 ? { color: GREEN } : movement < 0 ? { color: RED } : { color: SUB }]}>
                    {movement > 0 ? `+${movement}` : movement < 0 ? `${movement}` : '—'}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Breakdown card for leader */}
        {leader && (
          <View style={s.breakdownCard}>
            <Text style={s.breakdownTitle}>Desglose del líder</Text>
            <View style={s.breakdownGrid}>
              <BreakdownItem label="PR" value={breakdown?.pr ?? leader.basePoints ?? 0} />
              <BreakdownItem label="PE3" value={breakdown?.pe3 ?? 0} />
              <BreakdownItem label="Desafíos" value={breakdown?.desafios ?? 0} />
              <BreakdownItem label="Penal." value={breakdown?.penalizaciones ?? 0} color={RED} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BreakdownItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={s.bItem}>
      <Text style={s.bLabel}>{label}</Text>
      <Text style={[s.bValue, color ? { color } : {}]}>{value.toLocaleString('es-CL')}</Text>
    </View>
  );
}

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
  tabsBar: { borderBottomWidth: 1, borderBottomColor: BORDER },
  tabsContent: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  tabPillActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { fontSize: 12, fontWeight: '700', color: SUB },
  tabTextActive: { color: '#0a0f1a' },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  table: { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  tableHead: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  tableHeadCell: { fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  tableRowHighlight: { backgroundColor: ROW_HL },
  rankNum: { fontSize: 14, fontWeight: '800', color: TEXT },
  playerCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerName: { fontSize: 14, fontWeight: '600', color: TEXT, flex: 1 },
  ptsNum: { fontSize: 14, fontWeight: '800', color: TEXT, textAlign: 'right' },
  varNum: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  bubble: { justifyContent: 'center', alignItems: 'center' },
  bubbleText: { color: '#fff', fontWeight: '800' },
  emptyText: { color: SUB, textAlign: 'center', padding: 24, fontSize: 14 },
  breakdownCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  breakdownTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 14 },
  breakdownGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  bItem: { alignItems: 'center' },
  bLabel: { fontSize: 11, color: SUB, fontWeight: '600', marginBottom: 4 },
  bValue: { fontSize: 22, fontWeight: '800', color: GOLD },
});
