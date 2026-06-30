import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  ViewProps,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useAuthStore } from '../../../src/stores/auth.store';

/* ─── theme (matches Torneos hub) ──────────────────────────────────────────── */
const BG    = '#0a0f1a';
const CARD  = '#111827';
const GOLD  = '#d4a017';
const GREEN = '#22c55e';
const RED   = '#ef4444';
const TEXT  = '#f9fafb';
const SUB   = '#9ca3af';
const BORDER = '#1f2937';

/* ─── label maps ────────────────────────────────────────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  DRAFT:                'Borrador',
  REGISTRATION_OPEN:    'Inscripciones Abiertas',
  REGISTRATION_CLOSED:  'Inscripciones Cerradas',
  IN_PROGRESS:          'En Curso',
  COMPLETED:            'Finalizado',
  CANCELLED:            'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:                SUB,
  REGISTRATION_OPEN:    GREEN,
  REGISTRATION_CLOSED:  RED,
  IN_PROGRESS:          GOLD,
  COMPLETED:            SUB,
  CANCELLED:            RED,
};

const FORMAT_LABEL: Record<string, string> = {
  SINGLE_ELIMINATION: 'Eliminación Simple',
  ROUND_ROBIN:        'Round Robin',
  DOUBLES:            'Dobles',
  MIXED:              'Mixto',
  LEAGUE:             'Liga',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ─── main screen ───────────────────────────────────────────────────────────── */
export default function TorneoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuthStore();

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament-detail', id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  /* ── registration status ──────────────────────────────────────────────────── */
  const isRegistered = !!tournament?.registrations?.some(
    (r: any) => r.roster?.linkedPlayerProfile?.user?.id === user?.id,
  );
  const canRegister =
    tournament?.status === 'REGISTRATION_OPEN' && !isRegistered;
  const showBracket =
    tournament?.status === 'IN_PROGRESS' || tournament?.status === 'COMPLETED';

  const statusColor = STATUS_COLOR[tournament?.status] ?? SUB;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {tournament?.name ?? 'Torneo'}
          </Text>
          <Text style={s.headerSub}>Detalle del torneo</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : !tournament ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No se pudo cargar el torneo.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero card ── */}
          <View style={s.heroCard}>
            <Ionicons name="trophy" size={28} color={GOLD} style={{ marginBottom: 10 }} />
            <Text style={s.heroName}>{tournament.name}</Text>

            {/* Status badge */}
            <View style={[s.badge, { borderColor: statusColor, backgroundColor: statusColor + '22' }]}>
              <Text style={[s.badgeText, { color: statusColor }]}>
                {STATUS_LABEL[tournament.status] ?? tournament.status}
              </Text>
            </View>

            {/* Meta row */}
            <View style={s.metaRow}>
              <MetaChip icon="medal-outline" label={FORMAT_LABEL[tournament.format] ?? tournament.format} />
              {tournament.price > 0 && (
                <MetaChip icon="cash-outline" label={`$${tournament.price.toLocaleString('es-CL')}`} />
              )}
              {tournament.maxPlayers && (
                <MetaChip icon="people-outline" label={`Máx. ${tournament.maxPlayers}`} />
              )}
            </View>

            {/* Dates */}
            {tournament.startDate && (
              <View style={s.dateRow}>
                <Ionicons name="calendar-outline" size={14} color={SUB} />
                <Text style={s.dateTxt}>
                  {fmtDate(tournament.startDate)}
                  {tournament.endDate ? ` — ${fmtDate(tournament.endDate)}` : ''}
                </Text>
              </View>
            )}
            {tournament.registrationOpenDate && tournament.status === 'REGISTRATION_OPEN' && (
              <View style={s.dateRow}>
                <Ionicons name="time-outline" size={14} color={SUB} />
                <Text style={s.dateTxt}>
                  Inscripciones hasta{' '}
                  {tournament.registrationCloseDate
                    ? fmtDate(tournament.registrationCloseDate)
                    : '—'}
                </Text>
              </View>
            )}

            {tournament.description ? (
              <Text style={s.description}>{tournament.description}</Text>
            ) : null}
          </View>

          {/* ── CTA buttons ── */}
          <View style={s.ctaRow}>
            {canRegister && (
              <TouchableOpacity
                style={s.ctaPrimary}
                onPress={() => router.push(`/torneos/inscripcion/${id}` as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color="#0a0f1a" />
                <Text style={s.ctaPrimaryText}>INSCRIBIRME</Text>
              </TouchableOpacity>
            )}

            {isRegistered && (
              <View style={s.ctaRegistered}>
                <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                <Text style={s.ctaRegisteredText}>Inscrito</Text>
              </View>
            )}

            {showBracket && (
              <TouchableOpacity
                style={[s.ctaSecondary, canRegister && { flex: 1 }]}
                onPress={() => router.push(`/torneos/cuadro?tournamentId=${id}` as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="grid-outline" size={18} color={GOLD} />
                <Text style={s.ctaSecondaryText}>Ver Cuadro</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Categories ── */}
          {tournament.categories?.length > 0 && (
            <Section title="Categorías">
              {tournament.categories.map((cat: any) => {
                const catRegs = tournament.registrations?.filter(
                  (r: any) => r.categoryId === cat.id || r.category?.id === cat.id,
                ) ?? [];
                const userInCat = catRegs.some(
                  (r: any) => r.roster?.linkedPlayerProfile?.user?.id === user?.id,
                );
                return (
                  <View key={cat.id} style={s.catCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.catName}>{cat.name}</Text>
                      <Text style={s.catMeta}>
                        {[cat.levelMin && `Niv. ${cat.levelMin}${cat.levelMax ? `–${cat.levelMax}` : ''}`,
                          cat.gender,
                          cat.ageGroup,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={s.catCount}>
                        {catRegs.length}{cat.maxPlayers ? `/${cat.maxPlayers}` : ''} inscritos
                      </Text>
                      {userInCat && (
                        <View style={s.youBadge}>
                          <Text style={s.youBadgeText}>Tú</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </Section>
          )}

          {/* ── Participants ── */}
          {tournament.registrations?.length > 0 && (
            <Section title={`Participantes (${tournament.registrations.length})`}>
              {tournament.registrations.map((reg: any) => {
                const name =
                  reg.roster?.linkedPlayerProfile?.displayName ??
                  reg.roster?.linkedPlayerProfile?.user?.email ??
                  'Jugador';
                const catName = reg.category?.name ?? '';
                const isMe = reg.roster?.linkedPlayerProfile?.user?.id === user?.id;
                return (
                  <View key={reg.id} style={s.playerRow}>
                    <View style={s.playerAvatar}>
                      <Text style={s.playerAvatarText}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.playerName, isMe && { color: GOLD }]}>
                        {name}{isMe ? ' (tú)' : ''}
                      </Text>
                      {catName ? <Text style={s.playerCat}>{catName}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </Section>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/* ─── sub-components ─────────────────────────────────────────────────────────── */
function MetaChip({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon} size={12} color={SUB} />
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ViewProps['children'] }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TEXT },
  headerSub:  { fontSize: 12, color: SUB },

  scroll: { padding: 20, paddingBottom: 48, gap: 16 },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, color: SUB, textAlign: 'center' },

  /* Hero */
  heroCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1.5, borderColor: GOLD,
  },
  heroName: {
    fontSize: 22, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 10,
  },

  badge: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 5, marginBottom: 14,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1a2235', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontSize: 12, color: SUB },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dateTxt: { fontSize: 13, color: SUB },

  description: { fontSize: 13, color: SUB, textAlign: 'center', marginTop: 12, lineHeight: 19 },

  /* CTAs */
  ctaRow: { flexDirection: 'row', gap: 10 },
  ctaPrimary: {
    flex: 1, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaPrimaryText: { fontSize: 14, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },

  ctaRegistered: {
    flex: 1, backgroundColor: GREEN + '22', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: GREEN,
  },
  ctaRegisteredText: { fontSize: 14, fontWeight: '700', color: GREEN },

  ctaSecondary: {
    backgroundColor: CARD, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: GOLD,
  },
  ctaSecondaryText: { fontSize: 14, fontWeight: '700', color: GOLD },

  /* Section */
  section: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  sectionBody: { gap: 8 },

  /* Category cards */
  catCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  catName: { fontSize: 15, fontWeight: '700', color: TEXT },
  catMeta: { fontSize: 12, color: SUB, marginTop: 3 },
  catCount: { fontSize: 12, color: SUB },
  youBadge: {
    backgroundColor: GOLD + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: GOLD,
  },
  youBadgeText: { fontSize: 11, fontWeight: '700', color: GOLD },

  /* Player list */
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1a2235', borderWidth: 1, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarText: { fontSize: 15, fontWeight: '700', color: GOLD },
  playerName: { fontSize: 14, fontWeight: '600', color: TEXT },
  playerCat:  { fontSize: 12, color: SUB, marginTop: 2 },
});
