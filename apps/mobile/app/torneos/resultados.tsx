import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const TEXT = '#f9fafb'; const SUB = '#9ca3af';
const BORDER = '#1f2937';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}
const AVATAR_COLORS = ['#1b4a86','#16a34a','#7c3aed','#d97706','#0284c7','#dc2626'];

function AvatarBubble({ name, size = 36 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[idx], justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.35 }}>{initials(name)}</Text>
    </View>
  );
}

export default function ResultadosScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: results, isLoading } = useQuery({
    queryKey: ['club-results', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/match-results?source=TOURNAMENT,DESAFIO&limit=30`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId,
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Resultados</Text>
          <Text style={s.headerSub}>Marcadores finales</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : (results ?? []).length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="checkmark-circle-outline" size={40} color={SUB} />
            <Text style={s.emptyText}>Sin resultados registrados aún</Text>
          </View>
        ) : (
          (results ?? []).map((r: any, i: number) => (
            <ResultCard
              key={r.id ?? i}
              result={r}
              onPress={() => r.id && router.push(`/torneos/partido/${r.id}` as any)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ResultCard({ result, onPress }: { result: any; onPress: () => void }) {
  const p1 = result.player1Name ?? result.homePlayerName ?? 'Jugador 1';
  const p2 = result.player2Name ?? result.awayPlayerName ?? 'Jugador 2';
  const winnerId = result.winnerId;
  const p1Won = winnerId === result.player1Id;
  const p2Won = winnerId === result.player2Id;
  const score = result.scoreLabel ?? (result.sets ? result.sets.map((s: any) => `${s.p1}-${s.p2}`).join(' ') : '—');
  const ptsLabel = result.pointsAwarded ?? result.pointsEarned;
  const roundLabel = result.roundLabel ?? result.round ?? 'Partido';

  return (
    <TouchableOpacity style={rc.card} onPress={onPress} activeOpacity={0.8}>
      {/* Round + pts */}
      <View style={rc.topRow}>
        <Text style={rc.round}>{roundLabel}</Text>
        {ptsLabel != null && (
          <View style={rc.ptsBadge}>
            <Text style={rc.ptsText}>+{ptsLabel} pts</Text>
          </View>
        )}
      </View>

      {/* Players VS */}
      <View style={rc.vsRow}>
        {/* P1 */}
        <View style={rc.playerSide}>
          <AvatarBubble name={p1} size={36} />
          <Text style={[rc.playerName, p1Won && { color: TEXT }]} numberOfLines={1}>{p1}</Text>
          {p1Won && <View style={rc.winBadge}><Text style={rc.winText}>GANADOR</Text></View>}
        </View>

        {/* Score */}
        <View style={rc.scoreCol}>
          <Text style={rc.scoreLabel}>{score}</Text>
        </View>

        {/* P2 */}
        <View style={[rc.playerSide, { alignItems: 'flex-end' }]}>
          <AvatarBubble name={p2} size={36} />
          <Text style={[rc.playerName, p2Won && { color: TEXT }, { textAlign: 'right' }]} numberOfLines={1}>{p2}</Text>
          {p2Won && <View style={rc.winBadge}><Text style={rc.winText}>GANADOR</Text></View>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const rc = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1f2937', gap: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  round: { fontSize: 11, color: '#9ca3af', fontWeight: '700', letterSpacing: 0.3 },
  ptsBadge: {
    backgroundColor: '#d4a01722', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#d4a017',
  },
  ptsText: { fontSize: 11, fontWeight: '700', color: '#d4a017' },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerSide: { flex: 1, alignItems: 'flex-start', gap: 6 },
  playerName: { fontSize: 13, fontWeight: '700', color: '#9ca3af', flex: 1 },
  scoreCol: { alignItems: 'center', minWidth: 70 },
  scoreLabel: { fontSize: 16, fontWeight: '800', color: '#f9fafb' },
  winBadge: {
    backgroundColor: '#22c55e22', borderRadius: 6, borderWidth: 1, borderColor: '#22c55e',
    paddingHorizontal: 6, paddingVertical: 2,
  },
  winText: { fontSize: 10, fontWeight: '800', color: '#22c55e' },
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
  scroll: { padding: 16, paddingBottom: 48, gap: 10 },
  empty: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, color: SUB },
});
