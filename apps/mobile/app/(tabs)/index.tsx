import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Image, Dimensions,
  FlatList, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import * as Location from 'expo-location';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';
import {
  useMyFavoriteAnnouncementFeed,
  FavoriteAnnouncementFeedItem,
} from '../../src/hooks/use-favorites';
import {
  useHomeState,
  useMyUpcomingReservations,
  useMyMatchLogLite,
} from '../../src/hooks/use-home-state';
import {
  resolveClubAccent,
  withAlpha,
} from '../../src/lib/club-accent';

const CATEGORY_LABELS: Record<string, string> = {
  EVENTS: 'Eventos',
  OFFERS: 'Ofertas',
  MEMBERSHIP_OFFERS: 'Membresías',
  MATCH_FINDING: 'Buscar partido',
};
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  EVENTS: 'calendar',
  OFFERS: 'pricetag',
  MEMBERSHIP_OFFERS: 'shield-checkmark',
  MATCH_FINDING: 'flash',
};

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
  const isAvailable = profile?.availableForMatch ?? false;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const [availDuration, setAvailDuration] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const updateDuration = () => {
      if (!isAvailable || !profile?.locationUpdatedAt) { setAvailDuration(''); return; }
      const mins = Math.floor((Date.now() - new Date(profile.locationUpdatedAt).getTime()) / 60000);
      setAvailDuration(mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
    };
    updateDuration();
    if (isAvailable) {
      intervalRef.current = setInterval(updateDuration, 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAvailable, profile?.locationUpdatedAt]);

  const toggleAvail = useMutation({
    mutationFn: (payload: any) => api.patch('/players/me/availability', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['me-profile'] }); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo actualizar'),
  });

  const handleAvailabilityPress = () => {
    if (toggleAvail.isPending) return;

    if (isAvailable) {
      toggleAvail.mutate({ availableForMatch: false });
      return;
    }

    Alert.alert(
      'Ubicación temporal',
      'Tu ubicación se usará solo mientras actives "Disponible" para buscar rivales cercanos. Al apagarlo se elimina de inmediato.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
              Alert.alert('Permiso requerido', 'Necesitamos tu ubicación actual para mostrarte solo mientras estés disponible.');
              return;
            }

            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });

            toggleAvail.mutate({
              availableForMatch: true,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          },
        },
      ],
    );
  };

  // Ranking CTA target depends on whether the player has a club.
  const rankingTarget = home.hasMemberships ? '/club-ranking' : null;

  const quickActions = home.hasMemberships
    ? [
        { label: 'Reservar cancha', icon: 'tennisball', color: '#1b4a86', onPress: () => router.push('/(tabs)/explore') },
        { label: 'Buscar jugadores', icon: 'people', color: '#0284c7', onPress: () => router.push('/(tabs)/explore') },
        { label: 'Ranking', icon: 'podium', color: '#d97706', onPress: () => rankingTarget && router.push(rankingTarget as any) },
        { label: 'Mi log', icon: 'clipboard', color: '#7c3aed', onPress: () => router.push('/match-log' as any) },
      ]
    : [
        { label: 'Buscar cancha', icon: 'tennisball', color: '#1b4a86', onPress: () => router.push('/(tabs)/explore') },
        { label: 'Buscar jugadores', icon: 'people', color: '#0284c7', onPress: () => router.push('/(tabs)/explore') },
        ...(profile?.runPlayerId
          ? [{ label: 'Mi RUN', icon: 'globe', color: '#d97706', onPress: () => router.push('/(tabs)/profile' as any) }]
          : [{ label: 'Vincular RUN', icon: 'globe', color: '#d97706', onPress: () => router.push('/(tabs)/profile' as any) }]
        ),
        { label: 'Explorar clubes', icon: 'business', color: '#16a34a', onPress: () => router.push('/(tabs)/explore') },
      ];

  if (home.state === 'loading' && !me) {
    return (
      <View style={s.container}>
        <View style={s.loadingWrap}>
          <ActivityIndicator color="#1b4a86" size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting},</Text>
          <Text style={s.name}>{profile?.displayName ?? user?.email?.split('@')[0] ?? 'Jugador'} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={handleAvailabilityPress}
            style={[s.availBtn, isAvailable && s.availBtnOn]}
            disabled={toggleAvail.isPending}
          >
            {toggleAvail.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[s.availBtnText, isAvailable && s.availBtnTextOn]}>{isAvailable ? `● Disponible${availDuration ? ` · ${availDuration}` : ''}` : 'Disponible'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={s.avatar}>
            <Text style={s.avatarText}>
              {(profile?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={!!meLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ['me'] })} />}
      >
        <NoClubHero
          show={!home.hasMemberships}
          hasRun={!!profile?.runPlayerId}
        />

        {/* Favorited clubs announcement carousel */}
        <FavoritesCarouselSection />

        {/* Upcoming reservations */}
        <UpcomingReservationsSection />

        {/* Ranking — context-aware */}
        <RankingSection
          state={home.state}
          activeMemberships={home.activeMemberships}
        />

        {/* Match log — always rendered */}
        <MatchLogSection />

        {/* Quick actions — always available */}
        <Text style={s.sectionTitle}>Acciones rápidas</Text>
        <View style={s.quickGrid}>
          {quickActions.map(({ label, icon, color, onPress }) => (
            <TouchableOpacity key={label} style={s.quickCard} onPress={onPress} activeOpacity={0.7}>
              <View style={[s.quickIcon, { backgroundColor: color + '18' }]}>
                <Ionicons name={icon as any} size={24} color={color} />
              </View>
              <Text style={s.quickLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  No-club banner                                                            */
/* -------------------------------------------------------------------------- */

function NoClubHero({ show, hasRun }: { show: boolean; hasRun: boolean }) {
  const router = useRouter();
  if (!show) return null;
  return (
    <View style={s.noClubHero}>
      <View style={s.noClubHeroIconWrap}>
        <Ionicons name="business-outline" size={26} color="#1b4a86" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.noClubHeroTitle}>Aún no eres parte de un club</Text>
        <Text style={s.noClubHeroSub}>
          {hasRun
            ? 'Tienes un ranking nacional vinculado. Únete a un club cuando quieras para competir también a nivel local.'
            : 'Puedes explorar clubes, seguir los que te interesen y empezar a jugar.'}
        </Text>
      </View>
      <TouchableOpacity
        style={s.noClubHeroCta}
        onPress={() => router.push('/(tabs)/explore' as any)}
        activeOpacity={0.85}
      >
        <Text style={s.noClubHeroCtaText}>Explorar</Text>
        <Ionicons name="arrow-forward" size={14} color="#1b4a86" />
      </TouchableOpacity>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Favorited clubs — swipeable announcement carousel                         */
/* -------------------------------------------------------------------------- */

function FavoritesCarouselSection() {
  const router = useRouter();
  const { data: feed, isLoading } = useMyFavoriteAnnouncementFeed();

  const items = feed ?? [];
  const total = items.length;

  // No data + no favorites at all → render the "discover clubs" card as the
  // single carousel slot. Otherwise render one real card per favorited club.
  const showEmpty = total === 0;

  return (
    <View>
      <Text style={s.sectionTitle}>
        {showEmpty ? 'Clubes cerca de ti' : 'Anuncios de tus clubes'}
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#1b4a86" style={{ marginTop: 8 }} />
      ) : (
        <Carousel
          items={items}
          showEmpty={showEmpty}
          onDiscover={() => router.push('/(tabs)/explore' as any)}
          onOpenClub={clubId => router.push(`/club/${clubId}` as any)}
        />
      )}
    </View>
  );
}

function Carousel({
  items, showEmpty, onDiscover, onOpenClub,
}: {
  items: FavoriteAnnouncementFeedItem[];
  showEmpty: boolean;
  onDiscover: () => void;
  onOpenClub: (clubId: string) => void;
}) {
  const screen = Dimensions.get('window').width;
  const cardWidth = Math.min(screen - 32, 360);
  const [index, setIndex] = useState(0);

  // Reset when items shrink below current index (e.g. user removes a favorite)
  useEffect(() => {
    if (index > items.length) setIndex(0);
  }, [items.length, index]);

  if (showEmpty) {
    return (
      <TouchableOpacity
        style={[s.annCard, s.annCardEmpty]}
        onPress={onDiscover}
        activeOpacity={0.85}
      >
        <View style={[s.annCardInner, { width: cardWidth - 24 }]}>
          <View style={[s.annIconWrap, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="search" size={22} color="#1b4a86" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.annClub}>Descubre clubes cerca de ti</Text>
            <Text style={s.annTitle}>Sigue clubes para ver sus anuncios acá</Text>
            <View style={s.annCta}>
              <Text style={s.annCtaText}>Explorar clubes</Text>
              <Ionicons name="arrow-forward" size={14} color="#1b4a86" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = cardWidth;
    if (w > 0) setIndex(Math.round(x / w));
  };

  return (
    <View>
      <FlatList
        data={items}
        keyExtractor={(it) => it.clubId}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth, paddingRight: 0 }}>
            <AnnouncementCard item={item} onOpen={() => onOpenClub(item.clubId)} />
          </View>
        )}
      />
      {/* Dot indicators — show only when there's more than one card. */}
      {items.length > 1 && (
        <View style={s.dotsRow}>
          {items.map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === index && s.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function AnnouncementCard({
  item, onOpen,
}: {
  item: FavoriteAnnouncementFeedItem;
  onOpen: () => void;
}) {
  const accent = resolveClubAccent(item.clubAccentColor);
  const accentSoft = withAlpha(accent, '14');
  const category = item.announcement.category;
  const icon = CATEGORY_ICONS[category] ?? 'megaphone';
  const categoryLabel = CATEGORY_LABELS[category] ?? 'Anuncio';

  return (
    <TouchableOpacity
      style={[s.annCard, { backgroundColor: '#fff', borderLeftColor: accent }]}
      onPress={onOpen}
      activeOpacity={0.85}
    >
      <View style={s.annTopRow}>
        <View style={[s.annIconWrap, { backgroundColor: accentSoft }]}>
          {item.clubLogoUrl ? (
            <Image source={{ uri: item.clubLogoUrl }} style={s.annLogo} />
          ) : (
            <Ionicons name="business" size={20} color={accent} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.annClub} numberOfLines={1}>{item.clubName}</Text>
          <View style={s.annCategoryRow}>
            <Ionicons name={icon} size={11} color={accent} />
            <Text style={[s.annCategoryLabel, { color: accent }]}>{categoryLabel}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      </View>
      <Text style={s.annTitle} numberOfLines={2}>{item.announcement.title}</Text>
      <Text style={s.annSnippet} numberOfLines={2}>{item.announcement.body}</Text>
      <Text style={s.annTime}>
        {formatDistanceToNow(new Date(item.announcement.createdAt), { addSuffix: true, locale: es })}
      </Text>
    </TouchableOpacity>
  );
}

/* -------------------------------------------------------------------------- */
/*  Upcoming reservations                                                     */
/* -------------------------------------------------------------------------- */

function UpcomingReservationsSection() {
  const router = useRouter();
  const { data: reservations, isLoading } = useMyUpcomingReservations();
  const list = reservations ?? [];

  return (
    <View>
      <View style={s.sectionHeaderRow}>
        <Text style={s.sectionTitle}>Próximas reservas</Text>
        {list.length > 0 && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/calendar' as any)}>
            <Text style={s.linkText}>Ver todas</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#1b4a86" style={{ marginTop: 8 }} />
      ) : list.length === 0 ? (
        <TouchableOpacity
          style={s.emptyState}
          onPress={() => router.push('/(tabs)/explore' as any)}
          activeOpacity={0.85}
        >
          <View style={[s.emptyStateIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="calendar-outline" size={22} color="#16a34a" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.emptyStateTitle}>Sin reservas próximas</Text>
            <Text style={s.emptyStateSub}>Busca una cancha y reserva tu próximo partido</Text>
          </View>
          <View style={s.emptyStateCta}>
            <Text style={s.emptyStateCtaText}>Reservar</Text>
            <Ionicons name="arrow-forward" size={14} color="#16a34a" />
          </View>
        </TouchableOpacity>
      ) : (
        list.slice(0, 3).map((r) => (
          <TouchableOpacity
            key={r.id}
            style={s.resRow}
            onPress={() => router.push('/(tabs)/calendar' as any)}
            activeOpacity={0.85}
          >
            <View style={s.resDate}>
              <Text style={s.resDateDay}>{format(new Date(r.startTime), 'd')}</Text>
              <Text style={s.resDateMon}>{format(new Date(r.startTime), 'MMM', { locale: es })}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.resTitle}>{r.court?.name ?? 'Reserva'}</Text>
              <Text style={s.resClub}>{r.club?.profile?.name ?? r.club?.name ?? 'Club'}</Text>
              <Text style={s.resTime}>
                {format(new Date(r.startTime), "EEE d 'de' MMM · HH:mm", { locale: es })}
              </Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: r.status === 'CONFIRMED' ? '#16a34a' : '#d97706' }]} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ranking — context-aware                                                   */
/* -------------------------------------------------------------------------- */

function RankingSection({
  state, activeMemberships,
}: {
  state: 'loading' | 1 | 2 | 3;
  activeMemberships: Array<{ id: string; club?: { id: string; name: string } | null }>;
}) {
  const router = useRouter();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });
  const profile = me?.playerProfile;

  if (state === 'loading') {
    return (
      <View>
        <Text style={s.sectionTitle}>Ranking</Text>
        <ActivityIndicator color="#1b4a86" style={{ marginTop: 8 }} />
      </View>
    );
  }

  // State 1 or 2 → no memberships: show RUN ranking.
  if (state !== 3) {
    return <RunRankingCard profile={profile} />;
  }

  // State 3 → has memberships.
  if (activeMemberships.length === 1) {
    return <SingleClubRankingCard clubName={activeMemberships[0].club?.name ?? 'Tu club'} />;
  }

  // Multi-club — render a switcher header + the active club's card.
  return <MultiClubRankingSwitcher clubs={activeMemberships} />;
}

function RunRankingCard({ profile }: { profile: any }) {
  const router = useRouter();
  if (!profile?.runPlayerId) {
    return (
      <View>
        <Text style={s.sectionTitle}>Ranking</Text>
        <TouchableOpacity
          style={s.emptyState}
          onPress={() => router.push('/(tabs)/profile' as any)}
          activeOpacity={0.85}
        >
          <View style={[s.emptyStateIcon, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="globe-outline" size={22} color="#d97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.emptyStateTitle}>Sin ranking todavía</Text>
            <Text style={s.emptyStateSub}>
              Vincula tu perfil de TenisChile (RUN) o únete a un club para empezar a competir.
            </Text>
          </View>
          <View style={[s.emptyStateCta, { borderColor: '#d97706' }]}>
            <Text style={[s.emptyStateCtaText, { color: '#d97706' }]}>Vincular</Text>
            <Ionicons name="arrow-forward" size={14} color="#d97706" />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={s.sectionTitle}>Ranking Nacional (RUN)</Text>
      <TouchableOpacity
        style={s.rankingCard}
        onPress={() => router.push('/(tabs)/profile' as any)}
        activeOpacity={0.85}
      >
        <View style={s.rankingTopRow}>
          <View>
            <Text style={s.rankingLabel}>Posición RUN</Text>
            <Text style={s.rankingRank}>#{profile.runRankCached ?? '—'}</Text>
          </View>
          <View style={s.runningBadge}>
            <Text style={s.runningBadgeText}>Nacional</Text>
          </View>
        </View>
        <View style={s.rankingStatsRow}>
          <View style={s.rankingStat}>
            <Text style={s.rankingStatVal}>{profile.runPointsCached ?? '—'}</Text>
            <Text style={s.rankingStatLabel}>Puntos RUN</Text>
          </View>
          <View style={s.rankingStat}>
            <Text style={s.rankingStatVal}>{profile.runAtpPointsCached ?? '—'}</Text>
            <Text style={s.rankingStatLabel}>ATP</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function SingleClubRankingCard({ clubName }: { clubName: string }) {
  const router = useRouter();
  return (
    <View>
      <Text style={s.sectionTitle}>Ranking del club</Text>
      <TouchableOpacity
        style={s.rankingCard}
        onPress={() => router.push('/club-ranking' as any)}
        activeOpacity={0.85}
      >
        <View style={s.rankingTopRow}>
          <View>
            <Text style={s.rankingLabel}>Club</Text>
            <Text style={s.rankingClubName}>{clubName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </View>
        <Text style={s.rankingHint}>Toca para ver tu posición y el leaderboard interno</Text>
      </TouchableOpacity>
    </View>
  );
}

function MultiClubRankingSwitcher({
  clubs,
}: {
  clubs: Array<{ id: string; club?: { id: string; name: string } | null }>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(clubs[0]?.id ?? '');
  const selected = clubs.find(c => c.id === selectedId) ?? clubs[0];

  return (
    <View>
      <Text style={s.sectionTitle}>Ranking del club</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 4, gap: 8, paddingRight: 16 }}
      >
        {clubs.map((c) => {
          const active = c.id === selectedId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.clubPill, active && s.clubPillActive]}
              onPress={() => setSelectedId(c.id)}
              activeOpacity={0.85}
            >
              <Text style={[s.clubPillText, active && s.clubPillTextActive]}>
                {c.club?.name ?? 'Club'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={s.rankingCard}
        onPress={() => router.push('/club-ranking' as any)}
        activeOpacity={0.85}
      >
        <View style={s.rankingTopRow}>
          <View>
            <Text style={s.rankingLabel}>Club</Text>
            <Text style={s.rankingClubName}>{selected?.club?.name ?? 'Club'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </View>
        <Text style={s.rankingHint}>Toca para ver tu posición y el leaderboard interno</Text>
      </TouchableOpacity>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Match log — always shown                                                  */
/* -------------------------------------------------------------------------- */

function MatchLogSection() {
  const router = useRouter();
  const { data: entries, isLoading } = useMyMatchLogLite();
  const list = entries ?? [];

  return (
    <View>
      <View style={s.sectionHeaderRow}>
        <Text style={s.sectionTitle}>Mi registro</Text>
        {list.length > 0 && (
          <TouchableOpacity onPress={() => router.push('/match-log' as any)}>
            <Text style={s.linkText}>Ver todo</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#1b4a86" style={{ marginTop: 8 }} />
      ) : list.length === 0 ? (
        <TouchableOpacity
          style={s.emptyState}
          onPress={() => router.push('/match-log/add' as any)}
          activeOpacity={0.85}
        >
          <View style={[s.emptyStateIcon, { backgroundColor: '#faf5ff' }]}>
            <Ionicons name="clipboard-outline" size={22} color="#7c3aed" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.emptyStateTitle}>Registra tu primer partido</Text>
            <Text style={s.emptyStateSub}>Lleva el control de tus resultados sin importar el club</Text>
          </View>
          <View style={[s.emptyStateCta, { borderColor: '#7c3aed' }]}>
            <Text style={[s.emptyStateCtaText, { color: '#7c3aed' }]}>Agregar</Text>
            <Ionicons name="arrow-forward" size={14} color="#7c3aed" />
          </View>
        </TouchableOpacity>
      ) : (
        list.slice(0, 3).map((e) => {
          const won = e.playerWon === true;
          const lost = e.playerWon === false;
          const accent = won ? '#16a34a' : lost ? '#dc2626' : '#6b7280';
          return (
            <View key={e.id} style={s.logRow}>
              <View style={[s.logIconWrap, { backgroundColor: accent + '15' }]}>
                <Ionicons name="tennisball" size={18} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.logTitle}>
                  {e.opponentName ? `vs. ${e.opponentName}` : 'Partido'}
                </Text>
                <Text style={s.logSub}>
                  {format(new Date(e.playedAt), "d 'de' MMMM", { locale: es })}
                  {e.scoreSummary ? ` · ${e.scoreSummary}` : ''}
                </Text>
              </View>
              {won && <Text style={[s.logResult, { color: '#16a34a' }]}>Victoria</Text>}
              {lost && <Text style={[s.logResult, { color: '#dc2626' }]}>Derrota</Text>}
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1b4a86', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24,
  },
  greeting: { fontSize: 15, color: '#93b9e8', fontWeight: '500' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  availBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  availBtnOn: { backgroundColor: '#e5ff2c', borderColor: '#e5ff2c' },
  availBtnText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  availBtnTextOn: { color: '#1b4a86' },
  scroll: { padding: 16, paddingBottom: 32, gap: 20 },

  /* No-club hero */
  noClubHero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#1b4a86',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  noClubHeroIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#eff6ff',
    justifyContent: 'center', alignItems: 'center',
  },
  noClubHeroTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  noClubHeroSub: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 },
  noClubHeroCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  noClubHeroCtaText: { fontSize: 12, fontWeight: '800', color: '#1b4a86' },

  /* Sections */
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8 },
  linkText: { fontSize: 13, fontWeight: '700', color: '#1b4a86' },

  /* Announcement carousel */
  annCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginRight: 12,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  annCardEmpty: {
    borderLeftWidth: 0, borderWidth: 1, borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  annCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  annTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  annIconWrap: {
    width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  annLogo: { width: 28, height: 28, borderRadius: 8 },
  annClub: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  annCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  annCategoryLabel: { fontSize: 11, fontWeight: '700' },
  annTitle: { fontSize: 15, fontWeight: '800', color: '#111827', lineHeight: 21 },
  annSnippet: { fontSize: 13, color: '#374151', marginTop: 6, lineHeight: 18 },
  annTime: { fontSize: 11, color: '#9ca3af', marginTop: 10, fontWeight: '600' },
  annCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  annCtaText: { fontSize: 12, fontWeight: '800', color: '#1b4a86' },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, marginTop: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d1d5db' },
  dotActive: { backgroundColor: '#1b4a86', width: 18 },

  /* Empty state row (used by reservations / match log / ranking) */
  emptyState: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  emptyStateIcon: {
    width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  emptyStateTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  emptyStateSub: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 17 },
  emptyStateCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: '#16a34a',
  },
  emptyStateCtaText: { fontSize: 12, fontWeight: '800', color: '#16a34a' },

  /* Reservation row */
  resRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  resDate: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8,
  },
  resDateDay: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  resDateMon: { fontSize: 10, fontWeight: '700', color: '#16a34a', textTransform: 'uppercase' },
  resTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  resClub: { fontSize: 12, color: '#16a34a', marginTop: 2, fontWeight: '600' },
  resTime: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  /* Match log row */
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  logIconWrap: {
    width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  logTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  logSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  logResult: { fontSize: 11, fontWeight: '800' },

  /* Ranking */
  rankingCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  rankingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankingLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rankingRank: { fontSize: 32, fontWeight: '900', color: '#1b4a86', marginTop: 4 },
  rankingClubName: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 4 },
  runningBadge: { backgroundColor: '#fff7ed', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  runningBadgeText: { fontSize: 11, fontWeight: '800', color: '#d97706' },
  rankingHint: { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 18 },
  rankingStatsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  rankingStat: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, alignItems: 'center' },
  rankingStatVal: { fontSize: 20, fontWeight: '800', color: '#1b4a86' },
  rankingStatLabel: { fontSize: 11, color: '#1b4a86', marginTop: 3, fontWeight: '600' },

  /* Multi-club pill switcher */
  clubPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  clubPillActive: { backgroundColor: '#1b4a86', borderColor: '#1b4a86' },
  clubPillText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  clubPillTextActive: { color: '#fff' },

  /* Quick actions */
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  quickIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },
});