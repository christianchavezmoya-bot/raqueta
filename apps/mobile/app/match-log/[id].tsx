import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

const TYPE_LABELS: Record<string, string> = {
  MATCH: 'Partido',
  PRACTICE: 'Partido casual',
  TRAINING: 'Entrenamiento',
  COACHING: 'Coaching',
  FITNESS: 'Físico',
};

function isScoredMatch(type: string) {
  return type === 'MATCH' || type === 'PRACTICE';
}

export default function MatchLogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: ['match-log-entry', id],
    queryFn: async () => { const { data } = await api.get(`/players/me/match-log/${id}`); return data; },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/players/me/match-log/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-log'] });
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo eliminar'),
  });

  const confirmDelete = () => {
    Alert.alert('Eliminar entrada', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={s.title}>Entrada no encontrada</Text>
        </View>
      </View>
    );
  }

  const sets: any[] = entry.setsData ?? [];

  const formatSet = (set: any) => {
    const base = `${set.myGames}–${set.opponentGames}`;
    if (set.myTiebreak !== undefined && set.opponentTiebreak !== undefined) {
      return `${base} (${set.myTiebreak}–${set.opponentTiebreak})`;
    }
    return base;
  };

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>{TYPE_LABELS[entry.type] ?? entry.type}</Text>
        <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn} disabled={deleteMutation.isPending}>
          {deleteMutation.isPending
            ? <ActivityIndicator color="#dc2626" size="small" />
            : <Ionicons name="trash-outline" size={20} color="#dc2626" />}
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        {/* Result banner for scored matches */}
        {isScoredMatch(entry.type) && entry.playerWon !== null && entry.playerWon !== undefined && (
          <View style={[s.resultBanner, { backgroundColor: entry.playerWon ? '#f0fdf4' : '#fef2f2' }]}>
            <Text style={[s.resultText, { color: entry.playerWon ? '#16a34a' : '#dc2626' }]}>
              {entry.playerWon ? '🏆 Victoria' : '😤 Derrota'}
            </Text>
          </View>
        )}

        {/* Metadata */}
        <View style={s.metaCard}>
          <Row icon="calendar-outline" label="Fecha" value={new Date(entry.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })} />
          {(entry.opponent?.displayName ?? entry.opponentName) && (
            <Row icon="person-outline" label="Oponente" value={entry.opponent?.displayName ?? entry.opponentName} />
          )}
          {entry.location && <Row icon="map-outline" label="Lugar / superficie" value={entry.location} />}
          {isScoredMatch(entry.type) && <Row icon="settings-outline" label="Formato" value={`Al mejor de ${entry.bestOf ?? 3}`} />}
        </View>

        {/* Sets score */}
        {sets.length > 0 && (
          <View style={s.setsCard}>
            <Text style={s.setsTitle}>Marcador</Text>
            {sets.map((set: any, i: number) => (
              <View key={i} style={s.setRow}>
                <Text style={s.setLabel}>Set {i + 1}</Text>
                <Text style={s.setScore}>{formatSet(set)}</Text>
                {((set.myGames > set.opponentGames) ||
                  (set.myGames === 7 && set.opponentGames === 6 && (set.myTiebreak ?? 0) > (set.opponentTiebreak ?? 0))) && (
                  <View style={s.setWin}><Text style={s.setWinText}>✓</Text></View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {entry.notes && (
          <View style={s.notesCard}>
            <Text style={s.notesLabel}>Notas</Text>
            <Text style={s.notesText}>{entry.notes}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Ionicons name={icon as any} size={16} color="#6b7280" />
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  deleteBtn: { padding: 4 },
  body: { padding: 16, gap: 14 },
  resultBanner: { borderRadius: 14, padding: 20, alignItems: 'center' },
  resultText: { fontSize: 24, fontWeight: '800' },
  metaCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaLabel: { fontSize: 13, color: '#6b7280', flex: 1 },
  metaValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  setsCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  setsTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  setLabel: { fontSize: 13, color: '#6b7280', width: 48 },
  setScore: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  setWin: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' },
  setWinText: { fontSize: 12, color: '#16a34a', fontWeight: '700' },
  notesCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  notesLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  notesText: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
