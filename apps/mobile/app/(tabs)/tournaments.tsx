import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

/* ─── theme ────────────────────────────────────────────────────────────────── */
const BG    = '#0a0f1a';
const CARD  = '#111827';
const GOLD  = '#d4a017';
const GREEN = '#22c55e';
const TEXT  = '#f9fafb';
const SUB   = '#9ca3af';
const BORDER = '#1f2937';

const STATUS_COLOR: Record<string, string> = {
  REGISTRATION_OPEN: GREEN,
  IN_PROGRESS:       GOLD,
};

const STATUS_LABEL: Record<string, string> = {
  REGISTRATION_OPEN: 'Inscripciones abiertas',
  IN_PROGRESS:       'En curso',
  REGISTRATION_CLOSED: 'Inscripciones cerradas',
  COMPLETED:         'Finalizado',
};

/* ─── types ─────────────────────────────────────────────────────────────────── */
type MyTournament = {
  id: string;
  name: string;
  status: string;
  format: string;
  startDate: string;
  categories: Array<{ id: string; name: string }>;
  myCategories: Array<{ id: string; name: string }>;
  club: { id: string; name: string; profile?: { logoUrl?: string } };
};

/* ─── widget definitions ────────────────────────────────────────────────────── */
type Widget = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub: string;
  route: string;
};

const WIDGETS: Widget[] = [
  { icon: 'podium-outline',      label: 'Ranking General',    sub: 'Tabla por categorías',   route: '/torneos/ranking' },
  { icon: 'grid-outline',        label: 'Cuadro del Torneo',  sub: 'Llaves y avance',        route: '/torneos/cuadro' },
  { icon: 'phone-portrait-outline', label: 'Mis Partidos',    sub: 'Próximos y pasados',     route: '/torneos/mis-partidos' },
  { icon: 'checkmark-outline',   label: 'Resultados',         sub: 'Marcadores finales',     route: '/torneos/resultados' },
  { icon: 'close-outline',       label: 'Desafíos',           sub: 'Retos pendientes',       route: '/torneos/desafios' },
  { icon: 'arrow-up-outline',    label: 'Liga Promoción',     sub: 'Ascenso/descenso',       route: '/torneos/liga-promocion' },
  { icon: 'swap-horizontal-outline', label: 'Intercategorías', sub: 'Cruces de nivel',      route: '/torneos/intercategorias' },
  { icon: 'stats-chart-outline', label: 'Estadísticas',       sub: 'Win %, racha y puntos', route: '/torneos/estadisticas' },
  { icon: 'information-circle-outline', label: 'Reglas / Puntos', sub: 'Cómo se calcula',  route: '/torneos/reglas' },
];

/* ─── main screen ───────────────────────────────────────────────────────────── */
export default function TorneosHubScreen() {
  const router = useRouter();

  // Player-scoped tournament list — only tournaments this player is actually
  // registered in, across all clubs. Never a platform-wide leak.
  const { data: myTournaments, isLoading } = useQuery<MyTournament[]>({
    queryKey: ['my-tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/players/me/tournaments');
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  // Priority: IN_PROGRESS → REGISTRATION_OPEN → others. Same order as before,
  // but now scoped to the player's own registrations.
  const sorted = [...(myTournaments ?? [])].sort((a, b) => {
    const order = ['IN_PROGRESS', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'COMPLETED'];
    return (order.indexOf(a.status) ?? 99) - (order.indexOf(b.status) ?? 99);
  });
  const hasMultiple = sorted.length > 1;

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={s.topBar}>
        <View>
          <Text style={s.pageTitle}>Torneos</Text>
          <Text style={s.pageSubtitle}>Centro de competencia</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)}>
          <Ionicons name="notifications-outline" size={22} color={SUB} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── My tournaments section ── */}
        <Text style={s.sectionLabel}>MIS TORNEOS</Text>

        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 12, marginBottom: 4 }} />
        ) : sorted.length === 0 ? (
          // Empty state
          <View style={[s.heroCard, { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>Torneo Actual</Text>
              <Text style={s.heroName}>Sin torneos activos</Text>
              <Text style={s.heroMeta}>Consulta próximas competencias con tu club</Text>
            </View>
            <Ionicons name="trophy-outline" size={32} color={GOLD} />
          </View>
        ) : hasMultiple ? (
          // Multi-tournament horizontal scroll
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.multiScroll}
          >
            {sorted.map(t => (
              <TournamentCard key={t.id} tournament={t} onPress={() => router.push(`/torneos/torneo/${t.id}` as any)} />
            ))}
          </ScrollView>
        ) : (
          // Single tournament — compact hero, same as before
          <TournamentCard
            tournament={sorted[0]}
            onPress={() => router.push(`/torneos/torneo/${sorted[0].id}` as any)}
            wide
          />
        )}

        {/* ── Widget grid ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>ACCESOS RÁPIDOS</Text>
        <View style={s.grid}>
          {WIDGETS.map((w) => (
            <WidgetCard key={w.label} widget={w} onPress={() => router.push(w.route as any)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── tournament card ────────────────────────────────────────────────────────── */
function TournamentCard({
  tournament: t,
  onPress,
  wide = false,
}: {
  tournament: MyTournament;
  onPress: () => void;
  wide?: boolean;
}) {
  const statusColor = STATUS_COLOR[t.status] ?? SUB;
  const statusLabel = STATUS_LABEL[t.status] ?? t.status;
  const catName = t.myCategories?.[0]?.name ?? t.categories?.[0]?.name ?? '';
  const logoUrl: string | undefined = t.club?.profile?.logoUrl;

  return (
    <TouchableOpacity
      style={[s.heroCard, wide && s.heroCardWide]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1, gap: 6 }}>
        {/* Club row */}
        <View style={s.clubRow}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={s.clubLogo} />
          ) : (
            <View style={s.clubLogoFallback}>
              <Text style={s.clubLogoText}>{t.club.name.charAt(0)}</Text>
            </View>
          )}
          <Text style={s.clubNameText} numberOfLines={1}>{t.club.name}</Text>
        </View>

        {/* Tournament name */}
        <Text style={s.heroName} numberOfLines={2}>{t.name}</Text>

        {/* Category + status */}
        <View style={s.metaRow}>
          {catName ? <Text style={s.heroMeta}>{catName}</Text> : null}
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <Ionicons name="trophy" size={28} color={GOLD} style={{ alignSelf: 'flex-start' }} />
    </TouchableOpacity>
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

  scroll: { padding: 20, paddingBottom: 48, gap: 12 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 1,
  },

  pageTitle: { fontSize: 22, fontWeight: '800', color: TEXT },
  pageSubtitle: { fontSize: 13, color: SUB },

  /* Hero card — single tournament */
  heroCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1.5, borderColor: GOLD,
    width: 260,
  },
  heroCardWide: { width: '100%' },

  heroName: { fontSize: 18, fontWeight: '800', color: TEXT },
  heroLabel: { fontSize: 12, color: GOLD, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  heroMeta: { fontSize: 12, color: SUB },

  /* Multi-card scroll */
  multiScroll: { gap: 12, paddingRight: 4 },

  /* Club branding in each card */
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clubLogo: { width: 22, height: 22, borderRadius: 11 },
  clubLogoFallback: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#1a2235', borderWidth: 1, borderColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  clubLogoText: { fontSize: 10, fontWeight: '800', color: GOLD },
  clubNameText: { fontSize: 11, fontWeight: '600', color: SUB, flex: 1 },

  /* Status */
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600' },

  /* Widget grid — 2 columns */
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  widgetCard: {
    width: '47.8%', backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    position: 'relative', minHeight: 100,
  },
  widgetLabel: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 2 },
  widgetSub: { fontSize: 11, color: SUB },
  widgetArrow: { position: 'absolute', bottom: 12, right: 12 },
});
