import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useHomeState } from '../../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

const AVATAR_COLORS = ['#1b4a86','#16a34a','#7c3aed','#d97706','#0284c7','#dc2626'];

function AvatarBubble({ name, size = 48 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <View style={[ab.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[idx] }]}>
      <Text style={[ab.text, { fontSize: size * 0.35 }]}>{initials(name)}</Text>
    </View>
  );
}
const ab = StyleSheet.create({
  wrap: { justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});

export default function PartidoDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: match, isLoading } = useQuery({
    queryKey: ['match-detail', id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${firstClubId}/match-results/${id}`);
      return data;
    },
    enabled: !!firstClubId && !!id,
  });

  const p1Name = match?.player1Name ?? match?.homePlayerName ?? 'Jugador 1';
  const p2Name = match?.player2Name ?? match?.awayPlayerName ?? 'Jugador 2';
  const winner = match?.winnerId === match?.player1Id ? p1Name
    : match?.winnerId === match?.player2Id ? p2Name : null;

  const sets: Array<{ p1: string; p2: string }> = match?.sets
    ?? match?.setScores
    ?? [{ p1: '6', p2: '4' }, { p1: '6', p2: '3' }];

  const pointsEarned = match?.pointsAwarded ?? match?.pointsEarned ?? 0;
  const pointsLost = match?.pointsDeducted ?? match?.pointsPenalized ?? 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Detalle del Partido</Text>
          <Text style={s.headerSub}>{match?.roundLabel ?? match?.round ?? 'Cuartos de final'}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* VS card */}
          <View style={s.vsCard}>
            {/* Player 1 */}
            <View style={s.playerCol}>
              <AvatarBubble name={p1Name} size={56} />
              <Text style={s.playerName} numberOfLines={2}>{p1Name}</Text>
              {winner === p1Name && <View style={s.ganadorBadge}><Text style={s.ganadorText}>Ganador</Text></View>}
            </View>

            <Text style={s.vs}>VS</Text>

            {/* Player 2 */}
            <View style={s.playerCol}>
              <AvatarBubble name={p2Name} size={56} />
              <Text style={s.playerName} numberOfLines={2}>{p2Name}</Text>
              {winner === p2Name && <View style={s.ganadorBadge}><Text style={s.ganadorText}>Ganador</Text></View>}
            </View>
          </View>

          {/* Set scores */}
          <View style={s.setsCard}>
            <Text style={s.sectionTitle}>Marcador por sets</Text>
            {sets.map((set, i) => {
              const p1Won = parseInt(set.p1) > parseInt(set.p2);
              return (
                <View key={i} style={s.setRow}>
                  <Text style={s.setLabel}>Set {i + 1}</Text>
                  <Text style={[s.setScore, p1Won && { color: GREEN }]}>{set.p1}</Text>
                  <Text style={s.setDash}>–</Text>
                  <Text style={[s.setScore, !p1Won && { color: GREEN }]}>{set.p2}</Text>
                </View>
              );
            })}
          </View>

          {/* Points generated */}
          <View style={s.ptsCard}>
            <Text style={s.sectionTitle}>Puntos generados</Text>
            <View style={s.ptsRow}>
              <View style={s.ptsItem}>
                <Text style={s.ptsLabel}>Ganados</Text>
                <Text style={[s.ptsValue, { color: GREEN }]}>+{pointsEarned}</Text>
              </View>
              <View style={[s.ptsDivider]} />
              <View style={s.ptsItem}>
                <Text style={s.ptsLabel}>Descontados</Text>
                <Text style={[s.ptsValue, { color: RED }]}>-{pointsLost}</Text>
              </View>
              <View style={[s.ptsDivider]} />
              <View style={s.ptsItem}>
                <Text style={s.ptsLabel}>Neto</Text>
                <Text style={[s.ptsValue, { color: GOLD }]}>{pointsEarned - pointsLost}</Text>
              </View>
            </View>
          </View>

          {/* Explanation card */}
          <View style={s.explCard}>
            <Ionicons name="information-circle-outline" size={18} color={GOLD} style={{ marginBottom: 8 }} />
            <Text style={s.explTitle}>¿Cómo se calculan los puntos?</Text>
            <Text style={s.explText}>
              Los puntos se asignan según la categoría del partido, la diferencia de ranking entre jugadores y el resultado por sets.
              Partidos de categoría DESAFÍO tienen un multiplicador adicional basado en los puntos en juego acordados.
            </Text>
          </View>

          {/* Meta */}
          {match?.playedAt && (
            <Text style={s.meta}>
              Jugado el {new Date(match.playedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          )}
        </ScrollView>
      )}
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
  scroll: { padding: 20, paddingBottom: 48, gap: 16 },

  vsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: BORDER,
  },
  playerCol: { alignItems: 'center', flex: 1, gap: 10 },
  playerName: { fontSize: 13, fontWeight: '700', color: TEXT, textAlign: 'center' },
  vs: { fontSize: 18, fontWeight: '800', color: SUB, marginHorizontal: 8 },
  ganadorBadge: {
    backgroundColor: GREEN + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: GREEN,
  },
  ganadorText: { fontSize: 11, fontWeight: '700', color: GREEN },

  setsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER, gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 4 },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  setLabel: { flex: 1, fontSize: 13, color: SUB, fontWeight: '600' },
  setScore: { fontSize: 20, fontWeight: '800', color: TEXT, minWidth: 28, textAlign: 'center' },
  setDash: { fontSize: 16, color: SUB },

  ptsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  ptsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  ptsItem: { alignItems: 'center', gap: 6 },
  ptsLabel: { fontSize: 12, color: SUB, fontWeight: '600' },
  ptsValue: { fontSize: 28, fontWeight: '800' },
  ptsDivider: { width: 1, backgroundColor: BORDER },

  explCard: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  explTitle: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 6 },
  explText: { fontSize: 12, color: SUB, lineHeight: 18 },

  meta: { fontSize: 12, color: SUB, textAlign: 'center' },
});
