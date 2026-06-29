import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';
import { useMyFavoriteAnnouncementFeed } from '../../src/hooks/use-favorites';

const BG = '#0a0f1a';
const CARD = '#111827';
const CARD_ALT = '#0f172a';
const GOLD = '#d4a017';
const GREEN = '#22c55e';
const BLUE = '#60a5fa';
const TEXT = '#f9fafb';
const SUB = '#9ca3af';
const BORDER = '#1f2937';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  announcementId?: string | null;
};

type HomeFeedItem =
  | {
      id: string;
      type: 'notification';
      title: string;
      body: string;
      meta: string;
      createdAt: string;
      unread: boolean;
      onPress: () => void;
    }
  | {
      id: string;
      type: 'announcement';
      title: string;
      body: string;
      meta: string;
      createdAt: string;
      unread: false;
      onPress: () => void;
    };

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase();
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

function timeAgo(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    enabled: isAuthenticated,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationItem[]>('/notifications');
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnMount: 'always',
  });

  const home = useHomeState();
  const { data: favoriteAnnouncements = [] } = useMyFavoriteAnnouncementFeed();
  const sortedNotifications = [...notifications].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  const profile = me?.playerProfile;
  const displayName = profile?.displayName ?? user?.email?.split('@')[0] ?? 'Jugador';
  const clubName = home.activeMemberships?.[0]?.club?.name ?? 'Comunidad N-G';
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const { data: rankingData } = useQuery({
    queryKey: ['club-ranking-internal', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId,
  });

  const { data: nextMatch } = useQuery({
    queryKey: ['next-match', firstClubId, profile?.id],
    queryFn: async () => {
      if (!firstClubId || !profile?.id) return null;
      const myEntry = (rankingData ?? []).find(
        (entry: any) => entry.rosterEntry?.linkedPlayerProfileId === profile.id,
      );
      if (!myEntry?.rosterEntry?.id) return null;
      const { data } = await api.get(
        `/clubs/${firstClubId}/match-results?rosterId=${myEntry.rosterEntry.id}&status=SCHEDULED&limit=1`,
      );
      return Array.isArray(data) ? data[0] : (data?.data?.[0] ?? null);
    },
    enabled: !!firstClubId && !!profile?.id && Array.isArray(rankingData),
  });

  const myRankEntry = (rankingData ?? []).find(
    (entry: any) => entry.rosterEntry?.linkedPlayerProfileId === profile?.id,
  );

  const stats = profile?.stats;
  const winRate = stats?.matchesPlayed
    ? Math.round(((stats.wins ?? 0) / stats.matchesPlayed) * 100)
    : 0;
  const division = myRankEntry?.rosterEntry?.division;
  const headerMeta = profile?.level ? levelLabel(profile.level) : clubName;
  const unreadNotifications = sortedNotifications.filter(item => !item.readAt);
  const latestUnread = unreadNotifications[0] ?? null;
  const unreadCount = unreadNotifications.length;
  const announcedNotificationIds = new Set(
    sortedNotifications
      .map(item => item.announcementId)
      .filter((value): value is string => !!value),
  );

  const homeFeed: HomeFeedItem[] = [
    ...sortedNotifications.slice(0, 4).map(item => ({
      id: `notification-${item.id}`,
      type: 'notification' as const,
      title: item.title,
      body: item.message,
      meta: item.readAt ? `Notificacion · ${timeAgo(item.createdAt)}` : `Nueva notificacion · ${timeAgo(item.createdAt)}`,
      createdAt: item.createdAt,
      unread: !item.readAt,
      onPress: () => router.push('/notifications' as any),
    })),
    ...favoriteAnnouncements
      .filter(item => !announcedNotificationIds.has(item.announcement.id))
      .slice(0, 4)
      .map(item => ({
        id: `announcement-${item.announcement.id}`,
        type: 'announcement' as const,
        title: item.announcement.title,
        body: item.announcement.body,
        meta: `${item.clubName} · ${timeAgo(item.announcement.createdAt)}`,
        createdAt: item.announcement.createdAt,
        unread: false as const,
        onPress: () => router.push(`/club/${item.clubId}` as any),
      })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  const quickActions = [
    {
      label: 'reservar cancha',
      icon: 'tennisball-outline' as const,
      color: '#22c55e',
      onPress: () => router.push('/(tabs)/explore' as any),
    },
    {
      label: 'ver torneos',
      icon: 'trophy-outline' as const,
      color: GOLD,
      onPress: () => router.push('/(tabs)/tournaments' as any),
    },
    {
      label: 'buscar jugadores',
      icon: 'people-outline' as const,
      color: BLUE,
      onPress: () => router.push('/(tabs)/explore' as any),
    },
    {
      label: 'my log',
      icon: 'clipboard-outline' as const,
      color: '#c084fc',
      onPress: () => router.push('/match-log' as any),
    },
  ];

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['me'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['my-favorite-announcements'] });
    queryClient.invalidateQueries({ queryKey: ['club-ranking-internal', firstClubId] });
  };

  const openNotifications = () => setIsNotificationsOpen(true);
  const closeNotifications = () => setIsNotificationsOpen(false);

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <View style={s.topBarRight}>
          <View style={s.userSummary}>
            <View style={s.userMeta}>
              <Text style={s.userName}>Hola, {displayName.split(' ')[0]}</Text>
              <Text style={s.userLevel} numberOfLines={1}>
                {division ? `${headerMeta} · ${division}` : headerMeta}
              </Text>
            </View>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(displayName)}</Text>
            </View>
          </View>

          <TouchableOpacity style={s.bellButton} onPress={openNotifications}>
            <Ionicons name="notifications-outline" size={22} color={TEXT} />
            {unreadCount > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={!!meLoading}
            onRefresh={onRefresh}
            tintColor={GOLD}
          />
        }
      >
        {myRankEntry && (
          <View style={s.rankBadge}>
            <Text style={s.rankBadgeText}>
              Ranking #{myRankEntry.rank} · {myRankEntry.totalPoints?.toLocaleString('es-CL') ?? '—'} pts
            </Text>
          </View>
        )}

        <View style={s.brandBanner}>
          <Text style={s.brandWordmark}>N-G</Text>
          <View style={s.brandBall}>
            <Ionicons name="tennisball" size={24} color="#0a0f1a" />
          </View>
        </View>

        {latestUnread && (
          <TouchableOpacity
            style={s.beltCard}
            onPress={openNotifications}
            activeOpacity={0.85}
          >
            <View style={s.beltTopRow}>
              <View style={s.beltLabelWrap}>
                <Ionicons name="notifications" size={14} color="#06221a" />
                <Text style={s.beltLabel}>
                  {unreadCount === 1 ? '1 notificacion nueva' : `${unreadCount} notificaciones nuevas`}
                </Text>
              </View>
              <Text style={s.beltTime}>{timeAgo(latestUnread.createdAt)}</Text>
            </View>
            <Text style={s.beltTitle} numberOfLines={1}>{latestUnread.title}</Text>
            <Text style={s.beltMessage} numberOfLines={2}>{latestUnread.message}</Text>
          </TouchableOpacity>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Acciones rapidas</Text>
          <View style={s.quickGrid}>
            {quickActions.map(action => (
              <TouchableOpacity
                key={action.label}
                style={s.quickCard}
                onPress={action.onPress}
                activeOpacity={0.82}
              >
                <View style={[s.quickIconWrap, { backgroundColor: `${action.color}22` }]}>
                  <Ionicons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={s.quickLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {nextMatch && (
          <View style={s.matchCard}>
            <View style={s.matchHeader}>
              <Text style={s.matchLabel}>Proximo partido</Text>
              {nextMatch.roundLabel && (
                <View style={s.matchRoundBadge}>
                  <Text style={s.matchRoundText}>{nextMatch.roundLabel}</Text>
                </View>
              )}
            </View>
            <Text style={s.matchOpponent}>
              vs {resolveOpponentName(nextMatch, myRankEntry?.rosterEntry?.id)}
            </Text>
            {nextMatch.scheduledAt && (
              <Text style={s.matchMeta}>
                {new Date(nextMatch.scheduledAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                {nextMatch.courtName ? ` · ${nextMatch.courtName}` : ''}
              </Text>
            )}
            <TouchableOpacity
              style={s.matchCta}
              onPress={() => router.push(`/torneos/partido/${nextMatch.id}` as any)}
            >
              <Text style={s.matchCtaText}>VER DETALLE</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Resumen rapido</Text>
          <View style={s.statsGrid}>
            <StatBox label="Victorias" value={winRate ? `${winRate}%` : '—'} />
            <StatBox label="Partidos" value={String(stats?.matchesPlayed ?? '—')} />
            <StatBox label="Racha" value={String(stats?.currentStreak ?? '—')} />
            <StatBox label="Desafios" value={String(stats?.challengesPlayed ?? '—')} />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={isNotificationsOpen}
        transparent
        animationType="fade"
        onRequestClose={closeNotifications}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalHeaderCopy}>
                <Text style={s.modalTitle}>Notificaciones</Text>
                <Text style={s.modalSubtitle}>
                  {unreadCount === 0 ? 'Sin alertas nuevas' : `${unreadCount} nuevas`}
                </Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={closeNotifications}>
                <Ionicons name="close" size={20} color={TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>
              {homeFeed.length === 0 ? (
                home.hasMemberships ? (
                  <Text style={s.newsEmpty}>Sin noticias ni notificaciones recientes</Text>
                ) : (
                  <TouchableOpacity
                    style={s.newsItem}
                    onPress={() => {
                      closeNotifications();
                      router.push('/(tabs)/explore' as any);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={s.newsDot} />
                    <View style={s.newsCopy}>
                      <Text style={s.newsTitle}>Descubre clubes cerca de ti</Text>
                      <Text style={s.newsMeta}>Explora y unete a un club para recibir noticias y avisos</Text>
                    </View>
                  </TouchableOpacity>
                )
              ) : (
                homeFeed.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={s.newsItem}
                    onPress={() => {
                      closeNotifications();
                      item.onPress();
                    }}
                    activeOpacity={0.82}
                  >
                    <View style={[s.newsDot, item.unread && s.newsDotUnread]} />
                    <View style={s.newsCopy}>
                      <View style={s.newsTitleRow}>
                        <Text style={s.newsTitle} numberOfLines={1}>{item.title}</Text>
                        {item.unread && (
                          <View style={s.newsUnreadPill}>
                            <Text style={s.newsUnreadText}>Nueva</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.newsBody} numberOfLines={2}>{item.body}</Text>
                      <Text style={s.newsMeta} numberOfLines={1}>{item.meta}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function resolveOpponentName(nextMatch: any, myRosterId?: string) {
  const opponentRoster = nextMatch?.winnerRoster?.id === myRosterId
    ? nextMatch?.loserRoster
    : nextMatch?.winnerRoster;
  const name = `${opponentRoster?.firstName ?? ''} ${opponentRoster?.lastName ?? ''}`.trim();
  return name || 'Rival';
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  userSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  userMeta: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: 150,
  },
  userName: { fontSize: 15, fontWeight: '800', color: TEXT },
  userLevel: { fontSize: 12, color: SUB },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { fontSize: 10, fontWeight: '800', color: '#04110d' },
  scroll: { padding: 20, paddingBottom: 40, gap: 16 },
  brandBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  brandWordmark: {
    fontSize: 32,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: 0.8,
    lineHeight: 34,
  },
  brandBall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rankBadgeText: { fontSize: 12, fontWeight: '800', color: '#0a0f1a' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1f2d4a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: GOLD },
  beltCard: {
    backgroundColor: '#d9f99d',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: '#bef264',
  },
  beltTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  beltLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  beltLabel: { fontSize: 13, fontWeight: '800', color: '#06221a' },
  beltTime: { fontSize: 12, color: '#365314' },
  beltTitle: { fontSize: 17, fontWeight: '800', color: '#06221a', marginBottom: 6 },
  beltMessage: { fontSize: 14, lineHeight: 20, color: '#14532d' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    width: '47.6%',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 104,
    justifyContent: 'space-between',
  },
  quickIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 18,
  },
  matchCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  matchLabel: { fontSize: 13, fontWeight: '700', color: SUB },
  matchRoundBadge: {
    backgroundColor: '#1a2235',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  matchRoundText: { fontSize: 11, fontWeight: '700', color: GOLD },
  matchOpponent: { fontSize: 16, fontWeight: '800', color: TEXT },
  matchMeta: { fontSize: 12, color: SUB, marginBottom: 8 },
  matchCta: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchCtaText: { fontSize: 11, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.3 },
  newsItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  newsCopy: { flex: 1 },
  newsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
    marginTop: 6,
  },
  newsDotUnread: { backgroundColor: GREEN },
  newsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newsTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: TEXT },
  newsUnreadPill: {
    backgroundColor: '#14532d',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newsUnreadText: { fontSize: 10, fontWeight: '800', color: '#bbf7d0' },
  newsBody: { fontSize: 13, lineHeight: 18, color: '#cbd5e1', marginTop: 3 },
  newsMeta: { fontSize: 12, color: SUB, marginTop: 4 },
  newsEmpty: { fontSize: 13, color: SUB, paddingVertical: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    maxHeight: '78%',
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: TEXT },
  modalSubtitle: { fontSize: 12, color: SUB, marginTop: 4 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: { paddingBottom: 6 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    width: '47.2%',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statLabel: { fontSize: 12, color: SUB, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: TEXT },
});
