import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

/* ─── theme ────────────────────────────────────────────────────────────────── */
const BG    = '#0a0f1a';
const CARD  = '#111827';
const CARD2 = '#0f172a';
const GOLD  = '#d4a017';
const GOLD2 = '#f59e0b';
const GREEN = '#22c55e';
const RED   = '#ef4444';
const TEXT  = '#f9fafb';
const SUB   = '#9ca3af';
const BORDER = '#1f2937';

/* ─── helper ────────────────────────────────────────────────────────────────── */
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

function AvatarChip({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

/* ─── component ─────────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });

  const home = useHomeState();
  const profile = me?.playerProfile;
  const displayName = profile?.displayName ?? user?.email?.split('@')[0] ?? 'Jugador';

  // Ranking data for first active membership
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const { data: rankingData } = useQuery({
    queryKey: ['club-ranking-internal', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return null;
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      return data;
    },
    enabled: !!firstClubId,
  });

  // Club announcements
  const { data: announcements } = useQuery({
    queryKey: ['home-announcements', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/announcements?limit=3`);
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    enabled: !!firstClubId,
  });

  // Player's rank entry
  const myRankEntry = rankingData?.find((entry: any) => {
    const linkId = entry.rosterEntry?.linkedPlayerProfileId;
    return linkId && linkId === profile?.id;
  });

  // Stats from profile
  const stats = profile?.stats;
  const winRate = stats?.matchesPlayed
    ? Math.round(((stats.wins ?? 0) / stats.matchesPlayed) * 100)
    : 0;

  const onRefresh = () => {
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['club-ranking-internal', firstClubId] });
    qc.invalidateQueries({ queryKey: ['home-announcements', firstClubId] });
  };

  if (meLoading && !me) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const annList: any[] = announcements ?? [];
  const clubName = home.activeMemberships?.[0]?.club?.name ?? 'Mi Club';

  return (
    <View style={s.container}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={s.clubRow}>
          <View style={s.clubIcon}>
            <Text style={s.clubIconText}>{(clubName[0] ?? 'T').toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.clubSmall}>CLUB DE TENIS</Text>
            <Text style={s.clubName}>{clubName.toUpperCase()}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)}>
          <Ionicons name="notifications-outline" size={22} color={SUB} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={!!meLoading} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* ── Page heading ── */}
        <Text style={s.pageTitle}>Inicio</Text>
        <Text style={s.pageSubtitle}>Dashboard / Noticias</Text>

        {/* ── Greeting card ── */}
        <View style={s.greetCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetName}>Hola, {displayName.split(' ')[0]}</Text>
            {profile && (
              <Text style={s.greetLevel}>
                {profile.level ? levelLabel(profile.level) : 'Jugador'}
                {myRankEntry?.rosterEntry?.division ? ` · ${myRankEntry.rosterEntry.division}` : ''}
              </Text>
            )}
            {myRankEntry && (
              <View style={s.rankBadge}>
                <Text style={s.rankBadgeText}>
                  Ranking #{myRankEntry.rank} · {myRankEntry.totalPoints?.toLocaleString('es-CL') ?? '—'} pts
                </Text>
              </View>
            )}
          </View>
          <AvatarChip name={displayName} size={42} />
        </View>

        {/* ── Next match card ── */}
        <NextMatchCard clubId={firstClubId} myRosterId={myRankEntry?.rosterEntry?.id} />

        {/* ── Dashboard / Noticias ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Dashboard / Noticias</Text>
          <View style={s.newsCard}>
            {annList.length === 0 ? (
              home.hasMemberships ? (
                <Text style={s.newsMeta}>Sin anuncios recientes</Text>
              ) : (
                <TouchableOpacity style={s.newsItem} onPress={() => router.push('/(tabs)/explore' as any)}>
                  <View style={s.newsDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.newsTitle}>Descubre clubes cerca de ti</Text>
                    <Text style={s.newsMeta}>Explora y únete a un club para ver sus noticias</Text>
                  </View>
                </TouchableOpacity>
              )
            ) : (
              annList.map((ann: any) => (
                <TouchableOpacity key={ann.id} style={s.newsItem}>
                  <View style={s.newsDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.newsTitle} numberOfLines={1}>{ann.title}</Text>
                    <Text style={s.newsMeta} numberOfLines={1}>
                      {ann.category ?? ''}{ann.createdAt ? ` · ${formatDistanceToNow(new Date(ann.createdAt), { locale: es, addSuffix: true })}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* ── Resumen rápido ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Resumen rápido</Text>
          <View style={s.statsGrid}>
            <StatBox label="Victorias" value={winRate ? `${winRate}%` : '—'} />
            <StatBox label="Partidos" value={String(stats?.matchesPlayed ?? '—')} />
            <StatBox label="Racha" value={String(stats?.currentStreak ?? '—')} />
            <StatBox label="Desafíos" value={String(stats?.challengesPlayed ?? '—')} />
          </View>
        </View>

        {/* ── Explore club widget (Part A) ── */}
        {!home.hasMemberships && (
          <TouchableOpacity
            style={s.exploreCard}
            onPress={() => router.push('/(tabs)/explore' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={22} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.exploreTitle}>Explorar clubes y canchas</Text>
              <Text style={s.exploreSub}>Busca rivales, reserva canchas, sigue tus clubs favoritos</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={SUB} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

/* ─── Next Match Card ──────────────────────────────────────────────────────── */
function NextMatchCard({ clubId, myRosterId }: { clubId?: string; myRosterId?: string }) {
  const router = useRouter();

  const { data: nextMatch } = useQuery({
    queryKey: ['next-match', clubId, myRosterId],
    queryFn: async () => {
      if (!clubId || !myRosterId) return null;
      // Fetch recent match results and find scheduled/upcoming opponent
      const { data } = await api.get(`/clubs/${clubId}/match-results?rosterId=${myRosterId}&status=SCHEDULED&limit=1`);
      return Array.isArray(data) ? data[0] : (data?.data?.[0] ?? null);
    },
    enabled: !!clubId && !!myRosterId,
  });

  if (!nextMatch) return null;

  const opponentRoster = nextMatch.winnerRoster?.id === myRosterId
    ? nextMatch.loserRoster
    : nextMatch.winnerRoster;
  const opponentName = opponentRoster
    ? `${opponentRoster.firstName ?? ''} ${opponentRoster.lastName ?? ''}`.trim()
    : 'Rival';

  return (
    <View style={s.matchCard}>
      <View style={s.matchHeader}>
        <Text style={s.matchLabel}>Próximo partido</Text>
        {nextMatch.roundLabel && (
          <View style={s.matchRoundBadge}>
            <Text style={s.matchRoundText}>{nextMatch.roundLabel}</Text>
          </View>
        )}
      </View>
      <View style={s.matchRow}>
        <AvatarChip name={opponentName} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={s.matchOpponent}>vs {opponentName}</Text>
          {nextMatch.scheduledAt && (
            <Text style={s.matchMeta}>
              {new Date(nextMatch.scheduledAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
              {nextMatch.courtName ? ` · ${nextMatch.courtName}` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={s.matchCta}
          onPress={() => router.push(`/torneos/partido/${nextMatch.id}` as any)}
        >
          <Text style={s.matchCtaText}>VER DETALLE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─── Stat box ──────────────────────────────────────────────────────────────── */
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function levelLabel(level: string) {
  const map: Record<string, string> = {
    BEGINNER: 'Principiante',
    INTERMEDIATE: 'Intermedio',
    ADVANCED: 'Avanzado',
    COMPETITIVE: 'Nivel Oro',
  };
  return map[level] ?? level;
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

  scroll: { padding: 20, paddingBottom: 40, gap: 16 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: TEXT },
  pageSubtitle: { fontSize: 14, color: SUB },

  /* Greeting */
  greetCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  greetName: { fontSize: 18, fontWeight: '700', color: TEXT, marginBottom: 2 },
  greetLevel: { fontSize: 13, color: SUB, marginBottom: 8 },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rankBadgeText: { fontSize: 12, fontWeight: '800', color: '#0a0f1a' },

  avatar: {
    backgroundColor: '#1f2d4a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: GOLD,
  },
  avatarText: { fontWeight: '800', color: GOLD },

  /* Next match */
  matchCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  matchHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchLabel: { fontSize: 13, fontWeight: '700', color: SUB },
  matchRoundBadge: {
    backgroundColor: '#1a2235', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  matchRoundText: { fontSize: 11, fontWeight: '700', color: GOLD },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchOpponent: { fontSize: 15, fontWeight: '700', color: TEXT },
  matchMeta: { fontSize: 12, color: SUB, marginTop: 2 },
  matchCta: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  matchCtaText: { fontSize: 11, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.3 },

  /* Sections */
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT },

  /* News */
  newsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: BORDER, gap: 2,
  },
  newsItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  newsDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: GOLD, marginTop: 5,
  },
  newsTitle: { fontSize: 14, fontWeight: '600', color: TEXT, flex: 1 },
  newsMeta: { fontSize: 12, color: SUB, marginTop: 2 },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  statBox: {
    width: '47%', backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  statLabel: { fontSize: 12, color: SUB, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: TEXT },

  /* Explore card */
  exploreCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  exploreTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  exploreSub: { fontSize: 12, color: SUB, marginTop: 2 },
});
