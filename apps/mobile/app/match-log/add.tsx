import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

const TYPES = ['MATCH', 'PRACTICE', 'TRAINING', 'COACHING', 'FITNESS'] as const;
type EntryType = typeof TYPES[number];

const TYPE_LABELS: Record<EntryType, string> = {
  MATCH: 'Partido',
  PRACTICE: 'Partido casual',
  TRAINING: 'Entrenamiento',
  COACHING: 'Coaching',
  FITNESS: 'Físico',
};

export default function AddMatchLogScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    invitationId?: string;
    opponentId?: string;
    opponentName?: string;
    type?: EntryType;
  }>();
  const invitationId = typeof params.invitationId === 'string' ? params.invitationId : undefined;
  const invitationOpponentId = typeof params.opponentId === 'string' ? params.opponentId : undefined;
  const invitationOpponentName = typeof params.opponentName === 'string' ? params.opponentName : '';
  const initialType = params.type === 'PRACTICE' ? 'PRACTICE' : 'MATCH';

  const [type, setType] = useState<EntryType>(initialType);
  const [playedAt, setPlayedAt] = useState(() => new Date().toISOString().split('T')[0]);
  const [opponentName, setOpponentName] = useState(invitationOpponentName);
  const [surface, setSurface] = useState('');
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  // Sets: array of { myGames, opponentGames, myTiebreak?, opponentTiebreak? }
  const [sets, setSets] = useState([{ my: '', opp: '', myTb: '', oppTb: '' }]);
  const [notes, setNotes] = useState('');

  const addSet = () => {
    if (sets.length < 5) setSets(prev => [...prev, { my: '', opp: '', myTb: '', oppTb: '' }]);
  };
  const removeSet = (i: number) => setSets(prev => prev.filter((_, idx) => idx !== i));
  const updateSet = (i: number, field: 'my' | 'opp' | 'myTb' | 'oppTb', val: string) => {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  };

  const mutation = useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post('/players/me/match-log', payload); return data; },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-log'] });
      qc.invalidateQueries({ queryKey: ['my-invitations'] });
      Alert.alert('Registrado', 'Entrada agregada correctamente', [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo guardar'),
  });

  const handleSave = () => {
    const payload: any = { type, date: playedAt, notes: notes || undefined };
    const isScoredMatch = type === 'MATCH' || type === 'PRACTICE';
    if (isScoredMatch) {
      payload.opponentId = invitationOpponentId || undefined;
      payload.opponentName = invitationOpponentId ? undefined : opponentName || undefined;
      payload.location = surface || undefined;
      payload.bestOf = bestOf;
      const setsData = sets
        .filter(s => s.my !== '' && s.opp !== '')
        .map(s => {
          const set: any = { myGames: Number(s.my), opponentGames: Number(s.opp) };
          if (s.myTb !== '' && s.oppTb !== '') {
            set.myTiebreak = Number(s.myTb);
            set.opponentTiebreak = Number(s.oppTb);
          }
          return set;
        });
      if (setsData.length === 0) {
        Alert.alert('Sets requeridos', 'Ingresa al menos un set para registrar un partido');
        return;
      }
      payload.sets = setsData;
    }
    mutation.mutate(payload);
  };

  const showTiebreak = (s: typeof sets[0]) =>
    (s.my === '7' && s.opp === '6') || (s.my === '6' && s.opp === '7');

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>Nueva entrada</Text>
      </View>

      <View style={s.body}>
        {/* Type picker */}
        <Text style={s.label}>Tipo de sesión</Text>
        <View style={s.typeRow}>
          {TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[s.typeBtn, type === t && s.typeBtnActive]}
              onPress={() => !invitationId && setType(t)}
              disabled={!!invitationId}
            >
              <Text style={[s.typeBtnText, type === t && s.typeBtnTextActive]}>{TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date */}
        <Text style={s.label}>Fecha (AAAA-MM-DD)</Text>
        <TextInput
          style={s.input}
          value={playedAt}
          onChangeText={setPlayedAt}
          placeholder="2026-06-24"
          placeholderTextColor="#9ca3af"
        />

        {(type === 'MATCH' || type === 'PRACTICE') && (
          <>
            <Text style={s.label}>Oponente</Text>
            {invitationOpponentId ? (
              <View style={s.lockedField}>
                <Ionicons name="people-outline" size={18} color="#374151" />
                <Text style={s.lockedFieldText}>{opponentName || 'Invitación aceptada'}</Text>
              </View>
            ) : (
              <TextInput style={s.input} value={opponentName} onChangeText={setOpponentName} placeholder="Nombre del oponente" placeholderTextColor="#9ca3af" />
            )}

            <Text style={s.label}>Superficie (opcional)</Text>
            <TextInput testID="match-log-surface-input" style={s.input} value={surface} onChangeText={setSurface} placeholder="Arcilla, Dura, Césped..." placeholderTextColor="#9ca3af" />

            <Text style={s.label}>Formato</Text>
            <View style={s.typeRow}>
              {([3, 5] as const).map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.typeBtn, bestOf === n && s.typeBtnActive, { flex: 1 }]}
                  onPress={() => setBestOf(n)}
                >
                  <Text style={[s.typeBtnText, bestOf === n && s.typeBtnTextActive]}>Al mejor de {n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.setsHeader}>
              <Text style={s.label}>Sets</Text>
              <TouchableOpacity onPress={addSet} disabled={sets.length >= 5}>
                <Text style={[s.addSetBtn, sets.length >= 5 && { opacity: 0.4 }]}>+ Agregar set</Text>
              </TouchableOpacity>
            </View>

            {sets.map((set, i) => (
              <View key={i} style={s.setRow}>
                <Text style={s.setLabel}>Set {i + 1}</Text>
                <TextInput
                  testID={`match-log-set-${i + 1}-my`}
                  style={s.setInput}
                  value={set.my}
                  onChangeText={v => updateSet(i, 'my', v.replace(/\D/g, ''))}
                  placeholder="Yo"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  maxLength={1}
                />
                <Text style={s.dash}>–</Text>
                <TextInput
                  testID={`match-log-set-${i + 1}-opp`}
                  style={s.setInput}
                  value={set.opp}
                  onChangeText={v => updateSet(i, 'opp', v.replace(/\D/g, ''))}
                  placeholder="Opp"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  maxLength={1}
                />
                {showTiebreak(set) && (
                  <>
                    <Text style={s.tbLabel}>(TB)</Text>
                    <TextInput
                      testID={`match-log-set-${i + 1}-mytb`}
                      style={s.tbInput}
                      value={set.myTb}
                      onChangeText={v => updateSet(i, 'myTb', v.replace(/\D/g, ''))}
                      placeholder="7"
                      placeholderTextColor="#9ca3af"
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <Text style={s.dash}>–</Text>
                    <TextInput
                      testID={`match-log-set-${i + 1}-opptb`}
                      style={s.tbInput}
                      value={set.oppTb}
                      onChangeText={v => updateSet(i, 'oppTb', v.replace(/\D/g, ''))}
                      placeholder="5"
                      placeholderTextColor="#9ca3af"
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </>
                )}
                {sets.length > 1 && (
                  <TouchableOpacity onPress={() => removeSet(i)} style={s.removeSet}>
                    <Ionicons name="close-circle" size={20} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        <Text style={s.label}>Notas (opcional)</Text>
        <TextInput
          testID="match-log-notes-input"
          style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={invitationId ? 'Cómo terminó el partido casual, detalles clave...' : 'Cómo fue el partido, sensaciones...'}
          placeholderTextColor="#9ca3af"
          multiline
        />

        <TouchableOpacity
          testID="match-log-save-button"
          style={[s.saveBtn, mutation.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  body: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  lockedField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f3f4f6' },
  lockedFieldText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  typeBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  typeBtnTextActive: { color: '#fff' },
  setsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  addSetBtn: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  setLabel: { fontSize: 13, color: '#6b7280', width: 42 },
  setInput: { width: 50, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 10, fontSize: 18, fontWeight: '700', textAlign: 'center', color: '#111827', backgroundColor: '#fff' },
  tbLabel: { fontSize: 11, color: '#6b7280' },
  tbInput: { width: 44, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 10, fontSize: 16, fontWeight: '700', textAlign: 'center', color: '#111827', backgroundColor: '#fff' },
  dash: { fontSize: 18, color: '#9ca3af', fontWeight: '700' },
  removeSet: { marginLeft: 4 },
  saveBtn: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
