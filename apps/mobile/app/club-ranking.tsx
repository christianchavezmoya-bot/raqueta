import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../src/lib/api';

export default function ClubRankingScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-club-ranking'],
    queryFn: async () => {
      const { data } = await api.get('/players/me/club-ranking');
      return data;
    },
  });

  if (isLoading) {
    return <View style={s.loading}><ActivityIndicator color="#16a34a" /></View>;
  }

  const entry = data?.entry;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Mi Club</Text>
      <Text style={s.subtitle}>Ranking interno separado del ranking de torneos y del RUN.</Text>

      <View style={s.card}>
        <Text style={s.clubName}>{data?.club?.name ?? 'Sin club asignado'}</Text>
        {entry ? (
          <>
            <View style={s.statRow}>
              <View style={s.statBox}><Text style={s.statValue}>{entry.rank}</Text><Text style={s.statLabel}>Posici?n</Text></View>
              <View style={s.statBox}><Text style={s.statValue}>{entry.totalPoints}</Text><Text style={s.statLabel}>Puntos</Text></View>
              <View style={s.statBox}><Text style={s.statValue}>{entry.gamesPlayed}</Text><Text style={s.statLabel}>Partidos</Text></View>
            </View>
            <Text style={s.note}>Actualizado: {new Date(entry.updatedAt).toLocaleString('es-CL')}</Text>
          </>
        ) : (
          <Text style={s.empty}>Tu club a?n no tiene resultados internos cargados para ti.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingTop: 56 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 6, color: '#6b7280', fontSize: 14 },
  card: { marginTop: 20, backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2 },
  clubName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  statBox: { flex: 1, backgroundColor: '#f0fdf4', borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#166534' },
  statLabel: { marginTop: 4, fontSize: 12, color: '#166534' },
  note: { marginTop: 16, fontSize: 12, color: '#6b7280' },
  empty: { marginTop: 12, color: '#6b7280', fontSize: 14 },
});
