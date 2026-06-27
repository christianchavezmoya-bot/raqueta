import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import api from '../../src/lib/api';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
  COMPETITIVE: 'Competitivo',
  PROFESSIONAL: 'Profesional',
};

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

export default function ExploreScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'clubs' | 'players' | 'invitations'>('clubs');
  const [clubView, setClubView] = useState<'list' | 'map'>('list');
  const [commune, setCommune] = useState('');
  const [radiusMode, setRadiusMode] = useState(false);
  const [searchLocation, setSearchLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ['clubs-explore'],
    queryFn: async () => { const { data } = await api.get('/clubs?limit=50'); return data; },
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ['players-search', commune, radiusMode, searchLocation?.latitude, searchLocation?.longitude],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30' });
      if (commune) params.set('comuna', commune);
      if (radiusMode && searchLocation) {
        params.set('radiusKm', '1');
        params.set('latitude', String(searchLocation.latitude));
        params.set('longitude', String(searchLocation.longitude));
      }
      const { data } = await api.get(`/players/search?${params}`);
      return data;
    },
    enabled: tab === 'players',
  });

  const { data: invitations, isLoading: invLoading } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: async () => { const { data } = await api.get('/players/me/invitations'); return data; },
    enabled: tab === 'invitations',
  });

  const sendInvite = useMutation({
    mutationFn: (userId: string) => api.post(`/players/${userId}/invite`),
    onSuccess: () => {
      Alert.alert('Invitación enviada', '¡Tu invitación fue enviada!');
      qc.invalidateQueries({ queryKey: ['my-invitations'] });
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar la invitación'),
  });

  const acceptInvite = useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Error'),
  });

  const declineInvite = useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/decline`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
  });

  const filteredClubs = clubs?.data?.filter((club: any) =>
    !search || club.name.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  const mappableClubs = filteredClubs.filter((club: any) => club.profile?.hasMapLocation);
  const hiddenMapCount = filteredClubs.length - mappableClubs.length;

  const pendingReceived = invitations?.received?.filter((item: any) => item.status === 'PENDING') ?? [];
  const accepted = invitations?.received?.filter((item: any) => item.status === 'ACCEPTED') ?? [];
  const sent = invitations?.sent ?? [];

  const ensureSearchLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos tu ubicación actual para filtrar rivales dentro de 1 km.');
      return null;
    }
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const next = { latitude: location.coords.latitude, longitude: location.coords.longitude };
    setSearchLocation(next);
    return next;
  };

  const toggleRadiusMode = async () => {
    if (radiusMode) {
      setRadiusMode(false);
      setSearchLocation(null);
      return;
    }
    const location = await ensureSearchLocation();
    if (!location) return;
    setRadiusMode(true);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Explorar</Text>

        {tab !== 'invitations' && (
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={18} color="#9ca3af" style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              value={tab === 'players' ? commune : search}
              onChangeText={tab === 'players' ? setCommune : setSearch}
              placeholder={tab === 'clubs' ? 'Buscar club...' : 'Filtrar por comuna...'}
              placeholderTextColor="#9ca3af"
            />
          </View>
        )}

        <View style={s.tabs}>
          {(['clubs', 'players', 'invitations'] as const).map(item => (
            <TouchableOpacity key={item} style={[s.tab, tab === item && s.tabActive]} onPress={() => setTab(item)}>
              <Text style={[s.tabText, tab === item && s.tabTextActive]}>
                {item === 'clubs' ? 'Clubes' : item === 'players' ? 'Jugadores' : 'Invitaciones'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'clubs' && (
          <View style={s.toolbar}>
            <TouchableOpacity style={[s.toolBtn, clubView === 'list' && s.toolBtnActive]} onPress={() => setClubView('list')}>
              <Ionicons name="list-outline" size={16} color={clubView === 'list' ? '#fff' : '#374151'} />
              <Text style={[s.toolBtnText, clubView === 'list' && s.toolBtnTextActive]}>Lista</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toolBtn, clubView === 'map' && s.toolBtnActive]} onPress={() => setClubView('map')}>
              <Ionicons name="map-outline" size={16} color={clubView === 'map' ? '#fff' : '#374151'} />
              <Text style={[s.toolBtnText, clubView === 'map' && s.toolBtnTextActive]}>Mapa</Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === 'players' && (
          <View style={s.toolbar}>
            <TouchableOpacity style={[s.toolBtn, radiusMode && s.toolBtnActive]} onPress={toggleRadiusMode}>
              <Ionicons name="locate-outline" size={16} color={radiusMode ? '#fff' : '#374151'} />
              <Text style={[s.toolBtnText, radiusMode && s.toolBtnTextActive]}>Solo 1 km</Text>
            </TouchableOpacity>
            {radiusMode && <Text style={s.toolbarHint}>Oculta jugadores sin ubicación activa o fuera de 1 km.</Text>}
          </View>
        )}
      </View>

      {tab === 'clubs' && clubView === 'map' ? (
        <View style={s.mapWrap}>
          {clubsLoading ? (
            <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
          ) : (
            <>
              <MapView
                style={s.map}
                initialRegion={mappableClubs[0]
                  ? {
                      latitude: mappableClubs[0].profile.latitude,
                      longitude: mappableClubs[0].profile.longitude,
                      latitudeDelta: 0.12,
                      longitudeDelta: 0.12,
                    }
                  : DEFAULT_REGION}
              >
                {mappableClubs.map((club: any) => (
                  <Marker
                    key={club.id}
                    coordinate={{ latitude: club.profile.latitude, longitude: club.profile.longitude }}
                    title={club.name}
                    description={club.profile?.city ?? 'Club de tenis'}
                    onCalloutPress={() => router.push(`/club/${club.id}` as any)}
                  />
                ))}
              </MapView>
              <View style={s.mapLegend}>
                <Text style={s.mapLegendTitle}>Clubes con pin</Text>
                <Text style={s.mapLegendText}>
                  {mappableClubs.length} visibles
                  {hiddenMapCount > 0 ? ` · ${hiddenMapCount} omitidos por dirección sin geocodificar` : ''}
                </Text>
              </View>
            </>
          )}
        </View>
      ) : tab === 'clubs' ? (
        <FlatList
          data={filteredClubs}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            hiddenMapCount > 0 ? (
              <View style={s.infoBanner}>
                <Text style={s.infoBannerText}>
                  {hiddenMapCount} club(es) aún no tienen coordenadas válidas. Siguen visibles en la lista aunque no aparezcan en el mapa.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            clubsLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No se encontraron clubes</Text>
          }
          renderItem={({ item: club }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/club/${club.id}` as any)} activeOpacity={0.8}>
              <View style={s.cardIcon}>
                <Ionicons name="business" size={24} color="#16a34a" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{club.name}</Text>
                <Text style={s.cardSubtitle}>{club.profile?.city ? `📍 ${club.profile.city}` : 'Chile'}</Text>
                {club.profile?.mapStatus === 'MISSING_COORDINATES' && (
                  <Text style={s.warningTag}>Mapa pendiente por geocodificar</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          )}
        />
      ) : null}

      {tab === 'players' && (
        <FlatList
          data={players?.data ?? []}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Text style={s.sectionNote}>
              {radiusMode ? 'Jugadores disponibles dentro de 1 km' : 'Jugadores disponibles para partido'}
            </Text>
          }
          ListEmptyComponent={
            playersLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No hay jugadores disponibles con estos filtros</Text>
          }
          renderItem={({ item: player }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => router.push(`/player/${player.user.id}` as any)}>
              <View style={[s.cardIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="person" size={22} color="#7c3aed" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{player.displayName}</Text>
                <Text style={s.cardSubtitle}>
                  {LEVEL_LABELS[player.level] ?? player.level}
                  {player.comuna ? ` · ${player.comuna}` : ''}
                </Text>
                {typeof player.distanceKm === 'number' && <Text style={s.distanceTag}>{player.distanceKm.toFixed(2)} km</Text>}
                <View style={s.tagRow}>
                  {player.availableWeekdays && <Text style={s.tag}>Días de semana</Text>}
                  {player.availableWeekends && <Text style={s.tag}>Fines de semana</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={s.inviteBtn}
                onPress={() => sendInvite.mutate(player.user.id)}
                disabled={sendInvite.isPending}
              >
                <Text style={s.inviteBtnText}>Invitar</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {tab === 'invitations' && (
        <FlatList
          data={[
            ...pendingReceived.map((item: any) => ({ ...item, _section: 'received' })),
            ...accepted.map((item: any) => ({ ...item, _section: 'accepted' })),
            ...sent.map((item: any) => ({ ...item, _section: 'sent' })),
          ]}
          keyExtractor={(item: any) => item.id + item._section}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            invLoading
              ? <ActivityIndicator color="#16a34a" style={{ marginTop: 40 }} />
              : <Text style={s.empty}>No tienes invitaciones</Text>
          }
          renderItem={({ item: invitation }) => (
            <View style={s.invCard}>
              {invitation._section === 'received' && (
                <>
                  <Text style={s.invTitle}>
                    <Text style={s.invName}>{invitation.requester?.displayName}</Text> te invitó a jugar
                  </Text>
                  <Text style={s.invSub}>Nivel: {LEVEL_LABELS[invitation.requester?.level] ?? invitation.requester?.level}</Text>
                  <View style={s.invActions}>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => acceptInvite.mutate(invitation.id)}>
                      <Text style={s.acceptBtnText}>Aceptar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.declineBtn} onPress={() => declineInvite.mutate(invitation.id)}>
                      <Text style={s.declineBtnText}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {invitation._section === 'accepted' && (
                <>
                  <Text style={s.invTitle}>
                    Partido aceptado con <Text style={s.invName}>{invitation.requester?.displayName}</Text>
                  </Text>
                  {invitation.requester?.phone && <Text style={s.phoneText}>📞 {invitation.requester.phone}</Text>}
                </>
              )}
              {invitation._section === 'sent' && (
                <>
                  <Text style={s.invTitle}>
                    Invitación enviada a <Text style={s.invName}>{invitation.recipient?.displayName}</Text>
                  </Text>
                  <Text style={[
                    s.invSub,
                    { color: invitation.status === 'ACCEPTED' ? '#16a34a' : invitation.status === 'DECLINED' ? '#dc2626' : '#d97706' },
                  ]}>
                    {invitation.status === 'PENDING' ? 'Pendiente' : invitation.status === 'ACCEPTED' ? 'Aceptada' : 'Rechazada'}
                  </Text>
                </>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 12 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  tabs: { flexDirection: 'row', gap: 0, marginBottom: -1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#16a34a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#16a34a' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, flexWrap: 'wrap' },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  toolBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  toolBtnTextActive: { color: '#fff' },
  toolbarHint: { fontSize: 12, color: '#6b7280' },
  sectionNote: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  warningTag: { fontSize: 11, color: '#b45309', marginTop: 4 },
  distanceTag: { fontSize: 11, color: '#2563eb', marginTop: 4, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { fontSize: 11, color: '#16a34a' },
  inviteBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  inviteBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  mapWrap: { flex: 1, padding: 16 },
  map: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  mapLegend: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 14,
  },
  mapLegendTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  mapLegendText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  infoBanner: {
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 12,
    marginBottom: 10,
  },
  infoBannerText: { fontSize: 12, lineHeight: 18, color: '#9a3412' },
  invCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  invTitle: { fontSize: 14, color: '#374151', lineHeight: 20 },
  invName: { fontWeight: '700', color: '#111827' },
  invSub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  invActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  phoneText: { fontSize: 14, fontWeight: '600', color: '#16a34a', marginTop: 6 },
});
