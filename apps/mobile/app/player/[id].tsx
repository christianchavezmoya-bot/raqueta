import { useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { BarChart } from 'react-native-gifted-charts';
import { captureRef } from 'react-native-view-shot';
import api from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth.store';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
  COMPETITIVE: 'Competitivo',
  PROFESSIONAL: 'Profesional',
};

export default function PublicPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const shotRef = useRef<View | null>(null);
  const viewer = useAuthStore(state => state.user);

  const { data, isLoading } = useQuery({
    queryKey: ['player-public-mobile', id],
    queryFn: async () => {
      const { data } = await api.get(`/players/${id}/public`);
      return data;
    },
    enabled: !!id,
  });

  const { data: headToHead } = useQuery({
    queryKey: ['player-head-to-head', id, viewer?.id],
    queryFn: async () => {
      const { data } = await api.get(`/players/${id}/head-to-head/${viewer?.id}`);
      return data;
    },
    enabled: !!id && !!viewer?.id && viewer.id !== id,
    retry: false,
  });

  const handleShare = async () => {
    if (!shotRef.current) return;
    try {
      const uri = await captureRef(shotRef.current, { format: 'png', quality: 1 });
      await Share.share({
        url: uri,
        message: `${profile?.displayName ?? 'Jugador'} · Estadísticas públicas`,
      });
    } catch {
      Alert.alert('Error', 'No se pudo compartir la tarjeta.');
    }
  };

  if (isLoading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color="#16a34a" size="large" />
      </View>
    );
  }

  const profile = data?.playerProfile;
  if (!profile) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.emptyText}>Jugador no encontrado.</Text>
      </View>
    );
  }

  const statsCard = profile.statsCard;
  const trendBars = (profile.statsDetail?.trends ?? []).slice(-6).map((entry: any) => ({
    value: entry.matchesPlayed,
    label: entry.month.slice(5),
    frontColor: entry.source === 'LADDER' ? '#16a34a' : entry.source === 'TOURNAMENT' ? '#2563eb' : '#7c3aed',
  }));

  const sourceBars = (statsCard?.bySource ?? []).map((entry: any) => ({
    value: entry.wins,
    label: entry.source.replace('_', '\n'),
    frontColor: entry.source === 'LADDER' ? '#16a34a' : entry.source === 'TOURNAMENT' ? '#2563eb' : '#7c3aed',
  }));

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Perfil público</Text>
      </View>

      <View style={s.hero}>
        <View style={s.avatar}>
          <Ionicons name="person" size={34} color="#16a34a" />
        </View>
        <Text style={s.name}>{profile.displayName}</Text>
        <Text style={s.subtitle}>
          {LEVEL_LABELS[profile.level] ?? profile.level}
          {profile.comuna ? ` · ${profile.comuna}` : ''}
        </Text>
        {profile.homeClub?.name && <Text style={s.clubText}>{profile.homeClub.name}</Text>}
      </View>

      <View ref={shotRef} collapsable={false} style={s.card}>
        <View style={s.cardHeader}>
          <View>
            <Text style={s.cardEyebrow}>Stat Card</Text>
            <Text style={s.cardTitle}>Resumen competitivo</Text>
          </View>
          {statsCard && (
            <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={s.shareBtnText}>Compartir</Text>
            </TouchableOpacity>
          )}
        </View>

        {!statsCard ? (
          <Text style={s.privateNote}>
            Este jugador mantiene sus estadísticas privadas para otros jugadores.
          </Text>
        ) : (
          <>
            <View style={s.statsGrid}>
              {[
                { label: 'Partidos', value: statsCard.summary.matchesPlayed },
                { label: 'Victorias', value: statsCard.summary.wins },
                { label: 'Derrotas', value: statsCard.summary.losses },
                { label: 'Puntos', value: statsCard.summary.rankingPoints },
              ].map(item => (
                <View key={item.label} style={s.statBox}>
                  <Text style={s.statValue}>{item.value}</Text>
                  <Text style={s.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {sourceBars.length > 0 && (
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>Victorias por fuente</Text>
                <BarChart
                  data={sourceBars}
                  barWidth={28}
                  spacing={24}
                  roundedTop
                  roundedBottom
                  hideRules
                  xAxisColor="#d1d5db"
                  yAxisColor="#d1d5db"
                  yAxisTextStyle={{ color: '#6b7280', fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: '#6b7280', fontSize: 10 }}
                />
              </View>
            )}

            {trendBars.length > 0 && (
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>Actividad reciente</Text>
                <BarChart
                  data={trendBars}
                  barWidth={22}
                  spacing={16}
                  roundedTop
                  hideRules
                  xAxisColor="#d1d5db"
                  yAxisColor="#d1d5db"
                  yAxisTextStyle={{ color: '#6b7280', fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: '#6b7280', fontSize: 10 }}
                />
              </View>
            )}
          </>
        )}
      </View>

      {headToHead?.total && (
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Head-to-head contigo</Text>
          <Text style={s.infoText}>
            {headToHead.total.wins} victorias · {headToHead.total.losses} derrotas · {headToHead.total.matchesPlayed} enfrentamientos
          </Text>
          {(headToHead.bySource ?? []).map((entry: any) => (
            <Text key={entry.source} style={s.infoSub}>
              {entry.source}: {entry.wins}W / {entry.losses}L
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingTop: 56, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  hero: { alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 14 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  clubText: { fontSize: 13, color: '#16a34a', marginTop: 6, fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardEyebrow: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 3 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  privateNote: { fontSize: 14, lineHeight: 21, color: '#6b7280', marginTop: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  statBox: { width: '47%', borderRadius: 16, backgroundColor: '#f3f4f6', padding: 14 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  chartCard: { marginTop: 18, borderRadius: 18, backgroundColor: '#f8fafc', padding: 14 },
  chartTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 },
  infoCard: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  infoText: { fontSize: 14, color: '#374151', marginTop: 8 },
  infoSub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
