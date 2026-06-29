import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

export default function ReglasScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: bonusTypes, isLoading } = useQuery({
    queryKey: ['bonus-types', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/bonus-point-types`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId,
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Reglas / Puntos</Text>
          <Text style={s.headerSub}>Cómo se calculan los puntos</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Formula card */}
          <View style={s.formulaCard}>
            <Ionicons name="calculator-outline" size={20} color={GOLD} style={{ marginBottom: 8 }} />
            <Text style={s.formulaTitle}>Fórmula de puntos</Text>
            <Text style={s.formulaText}>
              <Text style={s.formulaCode}>PT = PR + PE3 + Desafíos − Penalizaciones + Bonos</Text>
            </Text>
            <Text style={s.formulaSub}>
              PR = puntos de resultado base{'\n'}
              PE3 = bonus por victorias en 3 sets{'\n'}
              Desafíos = resultado de retos directos{'\n'}
              Penalizaciones = puntos negativos aplicados por staff
            </Text>
          </View>

          {/* Point events table */}
          <View style={s.tableCard}>
            <Text style={s.sectionTitle}>Puntos por evento</Text>
            {POINT_EVENTS.map((e, i) => (
              <View key={i} style={[s.eventRow, i < POINT_EVENTS.length - 1 && s.eventRowBorder]}>
                <Text style={s.eventLabel}>{e.label}</Text>
                <Text style={[s.eventPts, { color: e.pts > 0 ? GREEN : RED }]}>
                  {e.pts > 0 ? `+${e.pts}` : e.pts} pts
                </Text>
              </View>
            ))}
          </View>

          {/* Club-configured bonus types */}
          {(bonusTypes ?? []).length > 0 && (
            <View style={s.tableCard}>
              <Text style={s.sectionTitle}>Bonos configurados por el club</Text>
              {(bonusTypes ?? []).map((bt: any, i: number) => (
                <View key={bt.id ?? i} style={[s.eventRow, i < (bonusTypes ?? []).length - 1 && s.eventRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventLabel}>{bt.name}</Text>
                    {bt.description && <Text style={s.eventDesc}>{bt.description}</Text>}
                  </View>
                  <Text style={[s.eventPts, { color: (bt.defaultPoints ?? bt.points ?? 0) > 0 ? GREEN : RED }]}>
                    {(bt.defaultPoints ?? bt.points ?? 0) > 0 ? `+${bt.defaultPoints ?? bt.points}` : bt.defaultPoints ?? bt.points} pts
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Desafio rules */}
          <View style={s.ruleCard}>
            <Ionicons name="flash-outline" size={16} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.ruleTitle}>Reglas de Desafíos</Text>
              <Text style={s.ruleText}>
                • Solo puedes desafiar a jugadores dentro de tu división o la inmediatamente superior{'\n'}
                • Los puntos en juego son acordados al enviar el desafío (mínimo 10, máximo 50){'\n'}
                • Un desafío vence en 7 días si no es aceptado{'\n'}
                • Tienes un (1) desafío disponible por semana
              </Text>
            </View>
          </View>

          {/* Liga promocion rules */}
          <View style={s.ruleCard}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.ruleTitle}>Liga de Promoción</Text>
              <Text style={s.ruleText}>
                • Al final de cada torneo, los 2 primeros ascienden de categoría{'\n'}
                • El último puesto desciende a la categoría inferior{'\n'}
                • La 1RA división no puede ascender; la más baja no desciende
              </Text>
            </View>
          </View>

          {/* Intercategoria rules */}
          <View style={s.ruleCard}>
            <Ionicons name="swap-horizontal-outline" size={16} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.ruleTitle}>Intercategorías</Text>
              <Text style={s.ruleText}>
                • Un bono del 25% se aplica al vencer a alguien de categoría superior{'\n'}
                • Una penalización del 15% aplica al perder contra alguien de categoría inferior{'\n'}
                • Los resultados no afectan el cuadro del torneo principal
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const POINT_EVENTS = [
  { label: 'Victoria en partido de torneo', pts: 30 },
  { label: 'Victoria con 3 sets (PE3)',     pts: 10 },
  { label: 'Derrota en partido de torneo',  pts: -5 },
  { label: 'Victoria en desafío',           pts: 25 },
  { label: 'Derrota en desafío',            pts: -25 },
  { label: 'No presentarse (W.O.)',         pts: -20 },
];

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

  formulaCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1.5, borderColor: GOLD,
  },
  formulaTitle: { fontSize: 15, fontWeight: '700', color: TEXT, marginBottom: 12 },
  formulaText: { marginBottom: 12 },
  formulaCode: {
    fontSize: 14, fontWeight: '800', color: GOLD, fontFamily: 'monospace',
  },
  formulaSub: { fontSize: 12, color: SUB, lineHeight: 20 },

  tableCard: {
    backgroundColor: CARD, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: TEXT,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  eventRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  eventLabel: { flex: 1, fontSize: 13, color: TEXT, fontWeight: '500' },
  eventDesc: { fontSize: 11, color: SUB, marginTop: 2 },
  eventPts: { fontSize: 14, fontWeight: '800', marginLeft: 12 },

  ruleCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 16, gap: 12,
    flexDirection: 'row', borderWidth: 1, borderColor: BORDER,
  },
  ruleTitle: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 6 },
  ruleText: { fontSize: 12, color: SUB, lineHeight: 20 },
});
