import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  playerOne?: { name?: string; rosterId?: string | null; memberRosterIds?: string[] };
  playerTwo?: { name?: string; rosterId?: string | null; memberRosterIds?: string[] };
  setScores?: Array<{ winner: number; loser: number }> | null;
  winnerSide?: 'ONE' | 'TWO' | null;
};

function MatchCard({
  match,
  onPress,
  currentRosterId,
}: {
  match?: MatchShape;
  onPress?: () => void;
  currentRosterId?: string | null;
}) {
  const p1 = match?.playerOne?.name ?? 'TBD';
  const p2 = match?.playerTwo?.name ?? 'TBD';
  const scores = buildScoreLines(match);
  const p1Won = match?.winnerSide === 'ONE';
  const p2Won = match?.winnerSide === 'TWO';
  const p1Self = !!currentRosterId && !!match?.playerOne?.memberRosterIds?.includes(currentRosterId);
  const p2Self = !!currentRosterId && !!match?.playerTwo?.memberRosterIds?.includes(currentRosterId);

  const inner = (
    <View style={mc.card}>
      <PlayerRow name={p1} score={scores.score1} won={p1Won} self={p1Self} />
      <PlayerRow name={p2} score={scores.score2} won={p2Won} self={p2Self} />
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity style={{ width: COL_W }} onPress={onPress} activeOpacity={0.8}>
      {inner}
    </TouchableOpacity>
  );
}

function PlayerRow({ name, score, won, self }: { name: string; score?: string; won?: boolean; self?: boolean }) {
  return (
    <View style={mc.row}>
      <Text style={[mc.name, won && mc.nameWon, self && mc.nameSelf]} numberOfLines={1}>{name}</Text>
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
  nameSelf:  { color: GOLD },
  score:     { fontSize: 13, fontWeight: '800', color: SUB, marginLeft: 6 },
  scoreWon:  { color: GREEN },
});

/* ── Bracket tree ────────────────────────────────────────────────────────────── */
type BracketRound = {
  round: string;
  label: string;
  bracketStage: string;
  matches: MatchShape[];
};

function BracketTree({ rounds, onMatchPress, currentRosterId }: {
  rounds: BracketRound[];
  onMatchPress: (id: string) => void;
  currentRosterId?: string | null;
}) {
  const mainRounds = rounds.filter(r => r.bracketStage === 'MAIN');
  const roundMap = new Map(
    mainRounds.map(round => [mapRound(round.round), round.matches]),
  );
  const q = Array.from({ length: 4 }, (_, index) => roundMap.get('CUARTOS')?.[index]);
  const s = Array.from({ length: 2 }, (_, index) => roundMap.get('SEMIS')?.[index]);
  const f = roundMap.get('FINAL')?.[0];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bt.scroll}>

      {/* ── CUARTOS column ── */}
      <View style={bt.col}>
        <Text style={bt.roundLabel}>CUARTOS</Text>
        {/* Pair A */}
        <View style={{ gap: INNER }}>
          <MatchCard match={q[0]} currentRosterId={currentRosterId} onPress={q[0]?.id ? () => onMatchPress(q[0]!.id!) : undefined} />
          <MatchCard match={q[1]} currentRosterId={currentRosterId} onPress={q[1]?.id ? () => onMatchPress(q[1]!.id!) : undefined} />
        </View>
        {/* Gap between pairs */}
        <View style={{ height: OUTER }} />
        {/* Pair B */}
        <View style={{ gap: INNER }}>
          <MatchCard match={q[2]} currentRosterId={currentRosterId} onPress={q[2]?.id ? () => onMatchPress(q[2]!.id!) : undefined} />
          <MatchCard match={q[3]} currentRosterId={currentRosterId} onPress={q[3]?.id ? () => onMatchPress(q[3]!.id!) : undefined} />
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
          <MatchCard match={s[0]} currentRosterId={currentRosterId} onPress={s[0]?.id ? () => onMatchPress(s[0]!.id!) : undefined} />
        </View>
        {/* Gap to Semi 1 */}
        <View style={{ height: SEMI_GAP }} />
        {/* Semi 1 */}
        <MatchCard match={s[1]} currentRosterId={currentRosterId} onPress={s[1]?.id ? () => onMatchPress(s[1]!.id!) : undefined} />
      </View>

      {/* ── Connector SEMIS → FINAL ── */}
      <View style={{ justifyContent: 'flex-start', paddingTop: 28 }}>
        <BracketConnector pairH={SEMI_CON_H} topOffset={SEMI_PAD_TOP} />
      </View>

      {/* ── FINAL column ── */}
      <View style={bt.col}>
        <Text style={bt.roundLabel}>FINAL</Text>
        <View style={{ paddingTop: FINAL_PAD_TOP }}>
          <MatchCard match={f} currentRosterId={currentRosterId} onPress={f?.id ? () => onMatchPress(f.id!) : undefined} />
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
  const currentRosterId = home.activeMemberships?.[0]?.roster?.id ?? null;

  // tournamentId may be passed from /torneos/torneo/[id] so the bracket always
  // shows the tournament the user just navigated from, not whichever is globally
  // "active" (relevant once a club runs more than one concurrent tournament).
  const { tournamentId: paramId } = useLocalSearchParams<{ tournamentId?: string }>();

  // Only fetch the player-scoped list when no explicit ID was passed in.
  // Uses /players/me/tournaments (never the platform-wide unfiltered list).
  const { data: myTournaments, isLoading: listLoading } = useQuery({
    queryKey: ['my-tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/players/me/tournaments');
      return Array.isArray(data) ? data : [];
    },
    enabled: !paramId,
    staleTime: 30_000,
  });

  const activeTournament = paramId
    ? { id: paramId, categories: [] as any[], name: '' }
    : (
        myTournaments?.find((t: any) => t.status === 'IN_PROGRESS') ??
        myTournaments?.find((t: any) => t.status === 'REGISTRATION_OPEN') ??
        myTournaments?.[0]
      );

  const isLoading = !paramId && listLoading;

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

  const registrationOnly = !!bracket?.registrationOnly;
  const rounds: BracketRound[] = bracket?.rounds ?? [];
  const participants: Array<{ rosterId?: string | null; name: string }> = bracket?.participants ?? [];

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
        ) : registrationOnly ? (
          <DrawPendingState participants={participants} />
        ) : (
          <BracketTree
            rounds={rounds}
            onMatchPress={id => router.push(`/torneos/partido/${id}` as any)}
            currentRosterId={currentRosterId}
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

function buildScoreLines(match?: MatchShape) {
  if (!match?.setScores?.length || !match.winnerSide) return { score1: undefined, score2: undefined };
  const score1 = match.setScores
    .map(set => match.winnerSide === 'ONE' ? set.winner : set.loser)
    .join(' ');
  const score2 = match.setScores
    .map(set => match.winnerSide === 'TWO' ? set.winner : set.loser)
    .join(' ');
  return { score1, score2 };
}

function mapRound(round?: string) {
  switch ((round ?? '').toUpperCase()) {
    case 'R1': return 'CUARTOS';
    case 'QF': return 'CUARTOS';
    case 'SF': return 'SEMIS';
    case 'F':
    case 'FINAL': return 'FINAL';
    default: return (round ?? '').toUpperCase();
  }
}

function DrawPendingState({ participants }: { participants: Array<{ name: string }> }) {
  return (
    <View style={pending.wrap}>
      <Ionicons name="git-branch-outline" size={38} color={GOLD} />
      <Text style={pending.title}>Cuadro por definir</Text>
      <Text style={pending.sub}>El fixture todavía no ha sido generado. Estos son los participantes inscritos:</Text>
      <View style={pending.list}>
        {participants.map((participant, index) => (
          <View key={`${participant.name}-${index}`} style={pending.row}>
            <Text style={pending.index}>{index + 1}.</Text>
            <Text style={pending.name}>{participant.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pending = StyleSheet.create({
  wrap: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: TEXT },
  sub: { fontSize: 13, color: SUB, lineHeight: 18 },
  list: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: { color: GOLD, fontWeight: '800' },
  name: { color: TEXT, fontSize: 14, fontWeight: '600', flex: 1 },
});
