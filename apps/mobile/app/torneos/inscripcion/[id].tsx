import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const TEXT = '#f9fafb'; const SUB = '#9ca3af';
const BORDER = '#1f2937';

export default function InscripcionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament-detail', id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const registerMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { data } = await api.post(`/tournaments/${id}/register`, { categoryId });
      return data;
    },
    onSuccess: () => setConfirmed(true),
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'No se pudo completar la inscripción';
      Alert.alert('Error', msg);
    },
  });

  const categories = tournament?.categories ?? [];

  if (confirmed) {
    return <ConfirmationScreen tournament={tournament} onBack={() => router.back()} />;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Inscripción al Torneo</Text>
          <Text style={s.headerSub}>Confirma tu participación</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Tournament card */}
          <View style={s.heroCard}>
            <Ionicons name="trophy" size={32} color={GOLD} style={{ marginBottom: 12 }} />
            <Text style={s.heroName}>{tournament?.name ?? '—'}</Text>
            {tournament?.startDate && (
              <Text style={s.heroMeta}>
                {new Date(tournament.startDate).toLocaleDateString('es-CL', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </Text>
            )}
            {tournament?.venue && (
              <Text style={s.heroMeta}>{tournament.venue}</Text>
            )}
            <View style={s.statusBadge}>
              <Text style={s.statusText}>Inscripciones abiertas</Text>
            </View>
          </View>

          {/* Category selector */}
          {categories.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Selecciona tu categoría</Text>
              {categories.map((cat: any) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catCard, selectedCategoryId === cat.id && s.catCardSelected]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.catName, selectedCategoryId === cat.id && { color: GOLD }]}>
                      {cat.name}
                    </Text>
                    {cat.description && (
                      <Text style={s.catDesc}>{cat.description}</Text>
                    )}
                  </View>
                  {selectedCategoryId === cat.id && (
                    <Ionicons name="checkmark-circle" size={22} color={GOLD} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Payment note */}
          <View style={s.paymentNote}>
            <Ionicons name="information-circle-outline" size={18} color={GOLD} style={{ marginTop: 1 }} />
            <Text style={s.paymentText}>
              Al inscribirte confirmás tu intención de participar. El pago de inscripción se coordina directamente con el club.
            </Text>
          </View>

          {/* Register button */}
          <TouchableOpacity
            style={[
              s.registerBtn,
              (!selectedCategoryId && categories.length > 0) && { opacity: 0.4 },
              registerMutation.isPending && { opacity: 0.6 },
            ]}
            onPress={() => {
              const catId = selectedCategoryId ?? categories[0]?.id;
              if (!catId) {
                Alert.alert('Sin categorías', 'Este torneo no tiene categorías configuradas aún.');
                return;
              }
              Alert.alert(
                'Confirmar inscripción',
                `¿Confirmas tu inscripción en ${tournament?.name}?`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Inscribirme', onPress: () => registerMutation.mutate(catId) },
                ],
              );
            }}
            disabled={registerMutation.isPending || (!selectedCategoryId && categories.length > 0)}
            activeOpacity={0.85}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator color="#0a0f1a" />
            ) : (
              <Text style={s.registerBtnText}>INSCRIBIRME</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function ConfirmationScreen({ tournament, onBack }: { tournament: any; onBack: () => void }) {
  return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      {/* Success icon */}
      <View style={cf.iconWrap}>
        <Ionicons name="checkmark" size={48} color="#0a0f1a" />
      </View>

      <Text style={cf.title}>¡Felicitaciones, ya estás inscrito!</Text>
      <Text style={cf.sub}>
        Contacta a tu club para coordinar el pago de inscripción.
      </Text>

      {tournament?.name && (
        <View style={cf.tournCard}>
          <Ionicons name="trophy-outline" size={20} color={GOLD} style={{ marginBottom: 6 }} />
          <Text style={cf.tournName}>{tournament.name}</Text>
          {tournament.startDate && (
            <Text style={cf.tournDate}>
              {new Date(tournament.startDate).toLocaleDateString('es-CL', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity style={cf.backBtn} onPress={onBack} activeOpacity={0.85}>
        <Text style={cf.backBtnText}>Volver a Torneos</Text>
      </TouchableOpacity>
    </View>
  );
}

const cf = StyleSheet.create({
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 12 },
  sub: { fontSize: 15, color: SUB, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  tournCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1.5, borderColor: GOLD, marginBottom: 32, width: '100%',
  },
  tournName: { fontSize: 18, fontWeight: '800', color: TEXT, textAlign: 'center' },
  tournDate: { fontSize: 13, color: SUB, marginTop: 4 },
  backBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 40, alignItems: 'center',
  },
  backBtnText: { fontSize: 14, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },
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
  scroll: { padding: 20, paddingBottom: 48, gap: 20 },

  heroCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1.5, borderColor: GOLD,
  },
  heroName: { fontSize: 22, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 6 },
  heroMeta: { fontSize: 13, color: SUB, marginBottom: 4 },
  statusBadge: {
    marginTop: 12, backgroundColor: GREEN + '22', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: GREEN,
  },
  statusText: { fontSize: 12, fontWeight: '700', color: GREEN },

  section: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  catCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  catCardSelected: { borderColor: GOLD, backgroundColor: '#1a2235' },
  catName: { fontSize: 15, fontWeight: '700', color: TEXT },
  catDesc: { fontSize: 12, color: SUB, marginTop: 3 },

  paymentNote: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: GOLD + '11', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: GOLD + '44',
  },
  paymentText: { flex: 1, fontSize: 13, color: SUB, lineHeight: 19 },

  registerBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center',
  },
  registerBtnText: { fontSize: 15, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },
});
