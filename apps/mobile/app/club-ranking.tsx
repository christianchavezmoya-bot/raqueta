import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/lib/api';

export default function ClubRankingScreen() {
  const router = useRouter();

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ['my-club-ranking'],
    queryFn: async () => {
      const { data } = await api.get('/players/me/club-ranking');
      return data;
    },
  });

  const clubId = myData?.club?.id;

  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ['club-leaderboard', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/rankings/internal`);
      return data;
    },
    enabled: !!clubId,
  });

  const isLoading = myLoading || (!!clubId && lbLoading);
  const myEntry = myData?.entry;
  const myRank = myEntry?.rank;

  if (isLoading) {
    return <View style={s.loading}><ActivityIndicator color="#1b4a86" size="large" /></View>;
  }

  const entries: any[] = leaderboard ?? [];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#1b4a86" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Ranking del club</Text>
          <Text style={s.subtitle}>{myData?.club?.name ?? 'Sin club asignado'}</Text>
        </View>
      </View>

      {/* My summary card */}
      {myEntry ? (
        <View style={s.myCard}>
          <View style={s.myRankWrap}>
            <Text style={s.myRankNum}>#{myRank}</Text>
            <Text style={s.myRankLabel}>Tu posición</Text>
          </View>
          <View style={s.myDivider} />
          <View style={s.myStat}>
            <Text style={s.myStatVal}>{myEntry.totalPoints}</Text>
            <Text style={s.myStatLabel}>Puntos</Text>
          </View>
          <View style={s.myDivider} />
          <View style={s.myStat}>
            <Text style={s.myStatVal}>{myEntry.gamesPlayed}</Text>
            <Text style={s.myStatLabel}>Partidos</Text>
          </View>
        </View>
      ) : (
        <View style={s.emptyCard}>
          <Ionicons name="trophy-outline" size={36} color="#d1d5db" />
          <Text style={s.emptyText}>Aún no tienes estadísticas en el ranking de tu club.</Text>
        </View>
      )}

      {/* Leaderboard */}
      {entries.length > 0 && (
        <View style={s.leaderboard}>
          <Text style={s.sectionTitle}>Clasificación</Text>
          {entries.slice(0, 20).map((entry: any, index: number) => {
            const rank = entry.rank ?? index + 1;
            const isMe = myRank != null && rank === myRank;
            const displayName =
              entry.rosterEntry?.linkedPlayerProfile?.displayName ??
              entry.rosterEntry?.playerName ??
              'Jugador';
            const isPodium = rank <= 3;
            return (
              <View key={entry.id} style={[s.row, isMe && s.rowMe]}>
                <View style={[s.rankBadge, isPodium && s.rankBadgePodium, rank === 1 && s.rankBadgeGold]}>
                  {rank === 1
                    ? <Ionicons name="trophy" size={13} color="#1b4a86" />
                    : <Text style={[s.rankNum, isPodium && s.rankNumPodium]}>{rank}</Text>}
                </View>
                <Text style={[s.rowName, isMe && s.rowNameMe]} numberOfLines={1}>{displayName}</Text>
                <View style={s.rowRight}>
                  <Text style={[s.rowPoints, isMe && s.rowPointsMe]}>{entry.totalPoints}</Text>
                  <Text style={s.rowPtsLabel}>pts</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  myCard: {
    backgroundColor: '#1b4a86', borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center', marginBottom: 24,
  },
  myRankWrap: { alignItems: 'center', flex: 1 },
  myRankNum: { fontSize: 36, fontWeight: '900', color: '#e5ff2c', lineHeight: 40 },
  myRankLabel: { fontSize: 12, color: '#93b9e8', marginTop: 4 },
  myDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  myStat: { alignItems: 'center', flex: 1 },
  myStatVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  myStatLabel: { fontSize: 12, color: '#93b9e8', marginTop: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 18, padding: 32, alignItems: 'center', gap: 12, marginBottom: 24 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  leaderboard: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, elevation: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, padding: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowMe: { backgroundColor: '#eff6ff' },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankBadgePodium: { backgroundColor: '#dbeafe' },
  rankBadgeGold: { backgroundColor: '#e5ff2c' },
  rankNum: { fontSize: 12, fontWeight: '800', color: '#6b7280' },
  rankNumPodium: { color: '#1b4a86' },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  rowNameMe: { color: '#1b4a86', fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  rowPoints: { fontSize: 15, fontWeight: '800', color: '#111827' },
  rowPointsMe: { color: '#1b4a86' },
  rowPtsLabel: { fontSize: 11, color: '#9ca3af' },
});
