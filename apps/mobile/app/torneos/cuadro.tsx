import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';
import { useAuthStore } from '../../src/stores/auth.store';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const TEXT = '#f9fafb'; const SUB = '#9ca3af';
const BORDER = '#1f2937'; const CARD2 = '#1a2235';

const ROUNDS = ['CUARTOS', 'SEMIS', 'FINAL'];

export default function CuadroTorneoScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const home = useHomeState();
  const { user } = useAuthStore();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeRound, setActiveRound] = useState('CUARTOS');

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['tournaments-cuadro'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments');
      return Array.isArray(data) ? data : [];
    },
  });

  const activeTournament = tournaments?.find(
    (t: any) => t.status === 'IN_PROGRESS',
  ) ?? tournaments?.find((t: any) => t.status === 'REGISTRATION_OPEN') ?? tournaments?.[0];

  const { data: bracket } = useQuery({
    queryKey: ['tournament-bracket', activeTournament?.id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${activeTournament!.id}/bracket`);
      return data;
    },
    enabled: !!activeTournament?.id,
  });

  // Staff-only: simulate/schedule next match
  const isStaff = user?.role === 'CLUB_ADMIN' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const simulateMutation = useMutation({
    mutationFn: async () => {
      if (!firstClubId || !activeTournament) return;
      const { data } = await api.post(`/clubs/${firstClubId}/match-results`, {
        tournamentId: activeTournament.id,
        autoAdvance: true,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-bracket', activeTournament?.id] });
      Alert.alert('Partido registrado', 'El resultado fue registrado y el cuadro avanzó.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo registrar'),
  });

  const roundMatches = (bracket?.matches ?? []).filter(
    (m: any) => m.round?.toUpperCase() === activeRound,
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Cuadro Principal</Text>
          <Text style={s.headerSub}>{activeTournament?.categories?.[0]?.name ?? 'Categoría'}</Text>
        </View>
      </View>

      {/* Round tabs */}
      <View style={s.roundTabs}>
        {ROUNDS.map(r => (
          <TouchableOpacity
            key={r}
            style={[s.roundTab, activeRound === r && s.roundTabActive]}
            onPress={() => setActiveRound(r)}
          >
            <Text style={[s.roundTabText, activeRound === r && s.roundTabTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : roundMatches.length === 0 ? (
          /* Show placeholder bracket cards if no real data yet */
          <PlaceholderBracket round={activeRound} />
        ) : (
          <View style={s.bracketCol}>
            {roundMatches.map((match: any, i: number) => (
              <MatchCard key={match.id ?? i} match={match} onPress={() => router.push(`/torneos/partido/${match.id}` as any)} />
            ))}
          </View>
        )}

        {/* Final TBD node */}
        {activeRound === 'FINAL' && (
          <View style={{ alignItems: 'center', marginTop: 24 }}>
            <Ionicons name="trophy" size={20} color={GOLD} />
            <Text style={[s.finalLabel, { marginTop: 6 }]}>FINAL</Text>
          </View>
        )}

        {/* Staff: Simular siguiente partido */}
        {isStaff && activeTournament && (
          <TouchableOpacity
            style={[s.simulateBtn, simulateMutation.isPending && { opacity: 0.6 }]}
            onPress={() => {
              Alert.alert(
                'Registrar resultado',
                'Esto registrará el resultado del próximo partido y actualizará el cuadro. Solo staff puede hacerlo.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Registrar', onPress: () => simulateMutation.mutate() },
                ],
              );
            }}
            disabled={simulateMutation.isPending}
          >
            <Text style={s.simulateBtnText}>
              {simulateMutation.isPending ? 'REGISTRANDO...' : 'SIMULAR SIGUIENTE PARTIDO'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function MatchCard({ match, onPress }: { match: any; onPress: () => void }) {
  const p1 = match.player1Name ?? match.player1 ?? 'TBD';
  const p2 = match.player2Name ?? match.player2 ?? 'TBD';
  const s1 = match.score1 ?? match.scorePlayer1;
  const s2 = match.score2 ?? match.scorePlayer2;
  const p1Won = match.winnerId === match.player1Id;
  const p2Won = match.winnerId === match.player2Id;

  return (
    <TouchableOpacity style={mc.card} onPress={onPress} activeOpacity={0.8}>
      <PlayerRow name={p1} score={s1} won={p1Won} />
      <PlayerRow name={p2} score={s2} won={p2Won} />
    </TouchableOpacity>
  );
}

function PlayerRow({ name, score, won }: { name: string; score?: string; won?: boolean }) {
  return (
    <View style={mc.row}>
      <Text style={[mc.name, won && { color: '#f9fafb' }]} numberOfLines={1}>{name}</Text>
      {score != null && (
        <Text style={[mc.score, won && { color: '#22c55e' }]}>{score}</Text>
      )}
    </View>
  );
}

function PlaceholderBracket({ round }: { round: string }) {
  const pairs: Array<[string, string]> =
    round === 'CUARTOS' ? [['Raúl Méndez', 'Matías G.'], ['Rafael Labbe', 'Pedro Z.'], ['David C.', 'Juan P.'], ['Jaime Lorca', 'Rodrigo V.']]
    : round === 'SEMIS'  ? [['Raúl Méndez', 'Rafael Labbe'], ['David C.', 'Jaime Lorca']]
    : [['TBD', 'TBD']];

  return (
    <View style={{ gap: 10 }}>
      {pairs.map(([a, b], i) => (
        <View key={i} style={mc.card}>
          <View style={mc.row}><Text style={mc.name}>{a}</Text></View>
          <View style={mc.row}><Text style={mc.name}>{b}</Text></View>
        </View>
      ))}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1f2937',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  name: { fontSize: 14, fontWeight: '600', color: '#9ca3af', flex: 1 },
  score: { fontSize: 14, fontWeight: '800', color: '#9ca3af', marginLeft: 8 },
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
  roundTabs: {
    flexDirection: 'row', gap: 8, padding: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  roundTab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  roundTabActive: { backgroundColor: GOLD, borderColor: GOLD },
  roundTabText: { fontSize: 12, fontWeight: '700', color: SUB },
  roundTabTextActive: { color: '#0a0f1a' },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  bracketCol: { gap: 10 },
  finalLabel: { fontSize: 13, fontWeight: '700', color: GOLD, letterSpacing: 1 },
  simulateBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 12,
  },
  simulateBtnText: { fontSize: 13, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },
});
