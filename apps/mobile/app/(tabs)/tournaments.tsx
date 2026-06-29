import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

/* ─── theme ────────────────────────────────────────────────────────────────── */
const BG    = '#0a0f1a';
const CARD  = '#111827';
const GOLD  = '#d4a017';
const TEXT  = '#f9fafb';
const SUB   = '#9ca3af';
const BORDER = '#1f2937';

/* ─── widget definitions ────────────────────────────────────────────────────── */
type Widget = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub: string;
  route: string;
};

const WIDGETS: Widget[] = [
  { icon: 'podium-outline',      label: 'Ranking General',  sub: 'Tabla por categorías',   route: '/torneos/ranking' },
  { icon: 'grid-outline',        label: 'Cuadro del Torneo', sub: 'Llaves y avance',        route: '/torneos/cuadro' },
  { icon: 'phone-portrait-outline', label: 'Mis Partidos',  sub: 'Próximos y pasados',     route: '/torneos/mis-partidos' },
  { icon: 'checkmark-outline',   label: 'Resultados',       sub: 'Marcadores finales',      route: '/torneos/resultados' },
  { icon: 'close-outline',       label: 'Desafíos',         sub: 'Retos pendientes',        route: '/torneos/desafios' },
  { icon: 'arrow-up-outline',    label: 'Liga Promoción',   sub: 'Ascenso/descenso',        route: '/torneos/liga-promocion' },
  { icon: 'swap-horizontal-outline', label: 'Intercategorías', sub: 'Cruces de nivel',     route: '/torneos/intercategorias' },
  { icon: 'stats-chart-outline', label: 'Estadísticas',     sub: 'Win %, racha y puntos',  route: '/torneos/estadisticas' },
  { icon: 'information-circle-outline', label: 'Reglas / Puntos', sub: 'Cómo se calcula',  route: '/torneos/reglas' },
];

/* ─── main screen ───────────────────────────────────────────────────────────── */
export default function TorneosHubScreen() {
  const router = useRouter();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['tournaments-hub', firstClubId],
    queryFn: async () => {
      const { data } = await api.get('/tournaments');
      return Array.isArray(data) ? data : [];
    },
  });

  const activeTournament = tournaments?.find(
    (t: any) => t.status === 'IN_PROGRESS' || t.status === 'REGISTRATION_OPEN',
  ) ?? tournaments?.[0];

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.clubRow}>
          <View style={s.clubIcon}>
            <Text style={s.clubIconText}>T</Text>
          </View>
          <View>
            <Text style={s.clubSmall}>CLUB DE TENIS</Text>
            <Text style={s.clubName}>DOMOS DE BATUCO</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)}>
          <Ionicons name="notifications-outline" size={22} color={SUB} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Torneos</Text>
        <Text style={s.pageSubtitle}>Centro de competencia</Text>

        {/* ── Torneo Actual highlight ── */}
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />
        ) : activeTournament ? (
          <TouchableOpacity
            style={s.heroCard}
            onPress={() => router.push(`/torneos/torneo/${activeTournament.id}` as any)}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>Torneo Actual</Text>
              <Text style={s.heroName}>{activeTournament.name}</Text>
              <Text style={s.heroMeta}>
                {activeTournament.categories?.[0]?.name ?? ''}
                {activeTournament.currentRound ? ` · ${activeTournament.currentRound}` : ''}
              </Text>
            </View>
            <Ionicons name="trophy" size={32} color={GOLD} />
          </TouchableOpacity>
        ) : (
          <View style={[s.heroCard, { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>Torneo Actual</Text>
              <Text style={s.heroName}>Sin torneo activo</Text>
              <Text style={s.heroMeta}>Consulta próximas competencias</Text>
            </View>
            <Ionicons name="trophy-outline" size={32} color={GOLD} />
          </View>
        )}

        {/* ── Widget grid ── */}
        <View style={s.grid}>
          {WIDGETS.map((w) => (
            <WidgetCard key={w.label} widget={w} onPress={() => router.push(w.route as any)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── widget card ───────────────────────────────────────────────────────────── */
function WidgetCard({ widget, onPress }: { widget: Widget; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.widgetCard} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={widget.icon} size={22} color={GOLD} style={{ marginBottom: 6 }} />
      <Text style={s.widgetLabel}>{widget.label}</Text>
      <Text style={s.widgetSub}>{widget.sub}</Text>
      <View style={s.widgetArrow}>
        <Ionicons name="chevron-forward" size={12} color={GOLD} />
      </View>
    </TouchableOpacity>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubIcon: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  clubIconText: { fontSize: 15, fontWeight: '800', color: GOLD },
  clubSmall: { fontSize: 10, color: SUB, fontWeight: '600', letterSpacing: 0.5 },
  clubName: { fontSize: 13, color: TEXT, fontWeight: '800', letterSpacing: 0.3 },

  scroll: { padding: 20, paddingBottom: 48, gap: 16 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: TEXT },
  pageSubtitle: { fontSize: 14, color: SUB },

  /* Hero card */
  heroCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1.5, borderColor: GOLD,
  },
  heroLabel: { fontSize: 12, color: GOLD, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  heroName: { fontSize: 20, fontWeight: '800', color: TEXT, marginBottom: 4 },
  heroMeta: { fontSize: 13, color: SUB },

  /* Widget grid — 2 columns */
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  widgetCard: {
    width: '47.8%', backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    position: 'relative', minHeight: 100,
  },
  widgetLabel: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 2 },
  widgetSub: { fontSize: 11, color: SUB },
  widgetArrow: {
    position: 'absolute', bottom: 12, right: 12,
  },
});
