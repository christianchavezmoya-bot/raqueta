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
const BORDER = '#1f2937'; const LINE = '#374151';

/* ── Layout constants ──────────────────────────────────────────────────────── */
const CARD_H   = 76;   // match card height (2 rows × 38px)
const INNER    = 8;    // gap between the two cards of a bracket pair
const OUTER    = 20;   // gap between bracket pairs in the same column
const COL_W    = 148;  // match-card column width
const CON_W    = 28;   // connector column width

// Derived positions (dp values matching the layout math):
const PAIR_H       = CARD_H * 2 + INNER;          // 160
const SEMI_PAD_TOP = (PAIR_H - CARD_H) / 2;       //  42 — centers semi on its pair
const SEMI_GAP     = OUTER + PAIR_H - CARD_H;     // 104 — gap between semi0 and semi1
// final positioned at the midpoint between the two semis:
const FINAL_PAD_TOP = SEMI_PAD_TOP + CARD_H / 2 + (SEMI_GAP + CARD_H) / 2 - CARD_H / 2; // 132
// connector for SEMIS → FINAL spans from semi0-midpoint to semi1-midpoint:
const SEMI_CON_H   = SEMI_PAD_TOP + CARD_H + SEMI_GAP; // 222

/* ── Branch connector ──────────────────────────────────────────────────────── */
type ConnectorProps = { pairH: number; topOffset?: number };

function BracketConnector({ pairH, topOffset = 0 }: ConnectorProps) {
  const midY  = pairH / 2;
  const armTop = CARD_H / 2;         // from top of connector to match-A midpoint
  const armLen = midY - armTop;      // arm height (same for top and bottom)

  return (
    <View style={{ width: CON_W, height: pairH, marginTop: topOffset }}>
      {/* Top arm: right border from match-A midpoint down to bracket center */}
      <View style={[con.arm, {
        top: armTop, height: armLen,
        borderTopWidth: 1.5, borderRightWidth: 1.5,
        borderTopRightRadius: 4,
      }]} />
      {/* Bottom arm: right border from bracket center up to match-B midpoint */}
      <View style={[con.arm, {
        bottom: armTop, height: armLen,
        borderBottomWidth: 1.5, borderRightWidth: 1.5,
        borderBottomRightRadius: 4,
      }]} />
    </View>
  );
}

const con = StyleSheet.create({
  arm: {
    position: 'absolute', left: 0, right: 0,
    borderColor: LINE,
  },
});

/* ── Match card ─────────────────────────────────────────────────────────────── */
type MatchShape = {
  id?: string;
  player1Name?: string; player1?: string; player1Id?: string;
  player2Name?: string; player2?: string; player2Id?: string;
  score1?: string; scorePlayer1?: string;
  score2?: string; scorePlayer2?: string;
  winnerId?: string;
};

function MatchCard({ match, onPress, placeholder }: { match?: MatchShape; onPress?: () => void; placeholder?: [string, string] }) {
  const p1   = match?.player1Name ?? match?.player1 ?? placeholder?.[0] ?? 'TBD';
  const p2   = match?.player2Name ?? match?.player2 ?? placeholder?.[1] ?? 'TBD';
  const s1   = match?.score1 ?? match?.scorePlayer1;
  const s2   = match?.score2 ?? match?.scorePlayer2;
  const p1Won = !!match?.winnerId && match.winnerId === match.player1Id;
  const p2Won = !!match?.winnerId && match.winnerId === match.player2Id;

  const inner = (
    <View style={mc.card}>
      <PlayerRow name={p1} score={s1} won={p1Won} />
      <PlayerRow name={p2} score={s2} won={p2Won} />
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity style={{ width: COL_W }} onPress={onPress} activeOpacity={0.8}>
      {inner}
    </TouchableOpacity>
  );
}

function PlayerRow({ name, score, won }: { name: string; score?: string; won?: boolean }) {
  return (
    <View style={mc.row}>
      <Text style={[mc.name, won && mc.nameWon]} numberOfLines={1}>{name}</Text>
      {score != null && <Text style={[mc.score, won && mc.scoreWon]}>{score}</Text>}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    width: COL_W, backgroundColor: CARD, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: CARD_H / 2,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  name:      { fontSize: 12, fontWeight: '600', color: SUB, flex: 1 },
  nameWon:   { color: TEXT },
  score:     { fontSize: 13, fontWeight: '800', color: SUB, marginLeft: 6 },
  scoreWon:  { color: GREEN },
});

/* ── Bracket tree ────────────────────────────────────────────────────────────── */
function BracketTree({ matches, onMatchPress }: {
  matches: MatchShape[];
  onMatchPress: (id: string) => void;
}) {
  // Normalise round labels to uppercase
  const byRound = (round: string) =>
    matches.filter(m => (m as any).round?.toUpperCase() === round.toUpperCase());

  const cuartos = byRound('CUARTOS');
  const semis   = byRound('SEMIS');
  const final   = byRound('FINAL');

  // Placeholder arrays when API has no matches yet
  const q: Array<MatchShape | undefined> = cuartos.length
    ? cuartos.slice(0, 4)
    : [undefined, undefined, undefined, undefined];
  const s: Array<MatchShape | undefined> = semis.length
    ? semis.slice(0, 2)
    : [undefined, undefined];
  const f: MatchShape | undefined = final[0];

  // Placeholder names used when no real data
  const qNames: Array<[string, string]> = [
    ['Raúl Méndez', 'Matías G.'], ['Rafael Labbé', 'Pedro Z.'],
    ['David C.', 'Juan P.'],      ['Jaime Lorca', 'Rodrigo V.'],
  ];
  const sNames: Array<[string, string]> = [
    ['Ganador M1', 'Ganador M2'], ['Ganador M3', 'Ganador M4'],
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bt.scroll}>

      {/* ── CUARTOS column ── */}
      <View style={bt.col}>
        <Text style={bt.roundLabel}>CUARTOS</Text>
        {/* Pair A */}
        <View style={{ gap: INNER }}>
          <MatchCard match={q[0]} placeholder={qNames[0]} onPress={q[0]?.id ? () => onMatchPress(q[0]!.id!) : undefined} />
          <MatchCard match={q[1]} placeholder={qNames[1]} onPress={q[1]?.id ? () => onMatchPress(q[1]!.id!) : undefined} />
        </View>
        {/* Gap between pairs */}
        <View style={{ height: OUTER }} />
        {/* Pair B */}
        <View style={{ gap: INNER }}>
          <MatchCard match={q[2]} placeholder={qNames[2]} onPress={q[2]?.id ? () => onMatchPress(q[2]!.id!) : undefined} />
          <MatchCard match={q[3]} placeholder={qNames[3]} onPress={q[3]?.id ? () => onMatchPress(q[3]!.id!) : undefined} />
        </View>
      </View>

      {/* ── Connectors CUARTOS → SEMIS (two brackets) ── */}
      <View style={{ justifyContent: 'flex-start', paddingTop: 28 }}>
        {/* Bracket for Pair A */}
        <BracketConnector pairH={PAIR_H} />
        {/* Gap matches the OUTER between pairs */}
        <View style={{ height: OUTER }} />
        {/* Bracket for Pair B */}
        <BracketConnector pairH={PAIR_H} />
      </View>

      {/* ── SEMIS column ── */}
      <View style={bt.col}>
        <Text style={bt.roundLabel}>SEMIS</Text>
        {/* Semi 0 centered on Pair A */}
        <View style={{ paddingTop: SEMI_PAD_TOP }}>
          <MatchCard match={s[0]} placeholder={sNames[0]} onPress={s[0]?.id ? () => onMatchPress(s[0]!.id!) : undefined} />
        </View>
        {/* Gap to Semi 1 */}
        <View style={{ height: SEMI_GAP }} />
        {/* Semi 1 */}
        <MatchCard match={s[1]} placeholder={sNames[1]} onPress={s[1]?.id ? () => onMatchPress(s[1]!.id!) : undefined} />
      </View>

      {/* ── Connector SEMIS → FINAL ── */}
      <View style={{ justifyContent: 'flex-start', paddingTop: 28 }}>
        <BracketConnector pairH={SEMI_CON_H} topOffset={SEMI_PAD_TOP} />
      </View>

      {/* ── FINAL column ── */}
      <View style={bt.col}>
        <Text style={bt.roundLabel}>FINAL</Text>
        <View style={{ paddingTop: FINAL_PAD_TOP }}>
          <MatchCard match={f} placeholder={['Ganador Semi 1', 'Ganador Semi 2']} onPress={f?.id ? () => onMatchPress(f.id!) : undefined} />
        </View>
        <View style={{ alignItems: 'center', paddingTop: 12 }}>
          <Ionicons name="trophy" size={18} color={GOLD} />
        </View>
      </View>

    </ScrollView>
  );
}

const bt = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, flexDirection: 'row', alignItems: 'flex-start' },
  col:    { width: COL_W },
  roundLabel: {
    fontSize: 10, fontWeight: '800', color: GOLD, letterSpacing: 0.8,
    marginBottom: 10, textAlign: 'center',
  },
});

/* ── Main screen ─────────────────────────────────────────────────────────────── */
export default function CuadroTorneoScreen() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const home    = useHomeState();
  const { user } = useAuthStore();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['tournaments-cuadro'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments');
      return Array.isArray(data) ? data : [];
    },
  });

  const activeTournament =
    tournaments?.find((t: any) => t.status === 'IN_PROGRESS') ??
    tournaments?.find((t: any) => t.status === 'REGISTRATION_OPEN') ??
    tournaments?.[0];

  const { data: bracket } = useQuery({
    queryKey: ['tournament-bracket', activeTournament?.id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${activeTournament!.id}/bracket`);
      return data;
    },
    enabled: !!activeTournament?.id,
  });

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

  const allMatches: MatchShape[] = bracket?.matches ?? [];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Cuadro Principal</Text>
          <Text style={s.headerSub}>{activeTournament?.categories?.[0]?.name ?? 'Categoría'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : (
          <BracketTree
            matches={allMatches}
            onMatchPress={id => router.push(`/torneos/partido/${id}` as any)}
          />
        )}

        {/* Staff action */}
        {isStaff && activeTournament && (
          <TouchableOpacity
            style={[s.simulateBtn, simulateMutation.isPending && { opacity: 0.6 }]}
            onPress={() => Alert.alert(
              'Registrar resultado',
              'Registrará el resultado del próximo partido y actualizará el cuadro. Solo staff.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Registrar', onPress: () => simulateMutation.mutate() },
              ],
            )}
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
  scroll: { paddingBottom: 48 },
  simulateBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginHorizontal: 16, marginTop: 8,
  },
  simulateBtnText: { fontSize: 13, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },
});
