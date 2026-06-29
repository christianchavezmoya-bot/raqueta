import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';
import { useAuthStore } from '../../src/stores/auth.store';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

const FILTER_TABS = ['TODOS', 'PRÓXIMOS', 'PASADOS'];

export default function MisPartidosScreen() {
  const router = useRouter();
  const home = useHomeState();
  const { user } = useAuthStore();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeFilter, setActiveFilter] = useState('TODOS');

  const { data: matches, isLoading } = useQuery({
    queryKey: ['my-matches', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/seasons/current/my-matches`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId,
  });

  const now = Date.now();
  const filtered = (matches ?? []).filter((m: any) => {
    if (activeFilter === 'TODOS') return true;
    const d = new Date(m.scheduledAt ?? m.playedAt ?? 0).getTime();
    return activeFilter === 'PRÓXIMOS' ? d >= now : d < now;
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Mis Partidos</Text>
          <Text style={s.headerSub}>Próximos y pasados</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={s.filterRow}>
        {FILTER_TABS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterTab, activeFilter === f && s.filterTabActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[s.filterText, activeFilter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="tennisball-outline" size={40} color={SUB} />
            <Text style={s.emptyText}>Sin partidos en esta categoría</Text>
          </View>
        ) : (
          filtered.map((match: any, i: number) => (
            <MatchRow
              key={match.id ?? i}
              match={match}
              onPress={() => match.id && router.push(`/torneos/partido/${match.id}` as any)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MatchRow({ match, onPress }: { match: any; onPress: () => void }) {
  const isPast = new Date(match.scheduledAt ?? match.playedAt ?? 0).getTime() < Date.now();
  const date = new Date(match.scheduledAt ?? match.playedAt ?? Date.now());
  const dayNum = date.getDate().toString().padStart(2, '0');
  const monthStr = date.toLocaleString('es-CL', { month: 'short' }).toUpperCase();

  const opponent = match.opponentName ?? match.player2Name ?? match.player1Name ?? 'Oponente';
  const score = match.scoreLabel ?? (match.sets ? match.sets.map((s: any) => `${s.p1}-${s.p2}`).join(' ') : null);
  const pts = match.pointsAwarded ?? match.pointsEarned ?? null;
  const won = match.result === 'WIN' || match.result === 'W';

  return (
    <TouchableOpacity style={mr.card} onPress={onPress} activeOpacity={0.8}>
      {/* Date block */}
      <View style={mr.dateBlock}>
        <Text style={mr.dayNum}>{dayNum}</Text>
        <Text style={mr.month}>{monthStr}</Text>
      </View>

      {/* Match info */}
      <View style={mr.info}>
        <Text style={mr.roundLabel}>{match.roundLabel ?? match.round ?? (isPast ? 'Partido pasado' : 'Próximo partido')}</Text>
        <Text style={mr.opponent} numberOfLines={1}>{opponent}</Text>
        {score && <Text style={mr.score}>{score}</Text>}
      </View>

      {/* Points delta */}
      {isPast && pts != null && (
        <View style={[mr.ptsBadge, won ? mr.ptsBadgeGreen : mr.ptsBadgeRed]}>
          <Text style={[mr.ptsText, { color: won ? GREEN : RED }]}>
            {won ? `+${pts}` : `-${pts}`}
          </Text>
          <Text style={[mr.ptsSub, { color: won ? GREEN : RED }]}>pts</Text>
        </View>
      )}

      {!isPast && (
        <View style={mr.pendingBadge}>
          <Text style={mr.pendingText}>POR JUGAR</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const mr = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: '#1f2937',
  },
  dateBlock: {
    width: 44, alignItems: 'center',
    backgroundColor: '#1a2235', borderRadius: 10, padding: 8,
  },
  dayNum: { fontSize: 18, fontWeight: '800', color: '#f9fafb' },
  month: { fontSize: 10, color: '#9ca3af', fontWeight: '700', letterSpacing: 0.5 },
  info: { flex: 1, gap: 3 },
  roundLabel: { fontSize: 11, color: '#d4a017', fontWeight: '700', letterSpacing: 0.3 },
  opponent: { fontSize: 14, fontWeight: '700', color: '#f9fafb' },
  score: { fontSize: 12, color: '#9ca3af' },
  ptsBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center' },
  ptsBadgeGreen: { backgroundColor: '#22c55e22', borderWidth: 1, borderColor: '#22c55e' },
  ptsBadgeRed: { backgroundColor: '#ef444422', borderWidth: 1, borderColor: '#ef4444' },
  ptsText: { fontSize: 15, fontWeight: '800' },
  ptsSub: { fontSize: 10, fontWeight: '700' },
  pendingBadge: {
    backgroundColor: '#1a2235', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  pendingText: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.3 },
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
  filterRow: {
    flexDirection: 'row', gap: 8, padding: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  filterTabActive: { backgroundColor: GOLD, borderColor: GOLD },
  filterText: { fontSize: 12, fontWeight: '700', color: SUB },
  filterTextActive: { color: '#0a0f1a' },
  scroll: { padding: 16, paddingBottom: 48, gap: 10 },
  empty: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, color: SUB },
});
