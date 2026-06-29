import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Image, Switch, TextInput,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/stores/auth.store';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante', INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',     COMPETITIVE: 'Competitivo',
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const home = useHomeState();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [show2FADisable, setShow2FADisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [runValue, setRunValue] = useState('');
  const [childRut, setChildRut] = useState('');
  const [requestingLink, setRequestingLink] = useState(false);

  const { data: me, refetch: refetchMe } = useQuery({
    queryKey: ['me-profile'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });

  const { data: myReservations } = useQuery({
    queryKey: ['my-reservations-profile'],
    queryFn: async () => { const { data } = await api.get('/users/me/reservations?limit=5'); return data; },
  });

  const { data: myMemberships } = useQuery({
    queryKey: ['my-memberships-profile'],
    queryFn: async () => { const { data } = await api.get('/users/me/memberships'); return data as any[]; },
  });

  const { data: myMembershipRequests } = useQuery({
    queryKey: ['my-membership-requests-profile'],
    queryFn: async () => { const { data } = await api.get('/players/me/membership-requests'); return data as any[]; },
  });

  const { data: myStats } = useQuery({
    queryKey: ['my-stats-profile'],
    queryFn: async () => { const { data } = await api.get('/players/me/stats'); return data; },
  });

  const { data: rankingEntry } = useQuery({
    queryKey: ['my-ranking-entry', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return null;
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      const entries = Array.isArray(data) ? data : [];
      const profileId = me?.playerProfile?.id;
      return entries.find((e: any) => e.rosterEntry?.playerProfileId === profileId) ?? entries[0] ?? null;
    },
    enabled: !!firstClubId && !!me,
  });

  const enable2FA = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable'),
    onSuccess: () => { refetchMe(); Alert.alert('2FA activado', 'Se envió un código a tu email para confirmar.'); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'Error'),
  });

  const disable2FA = useMutation({
    mutationFn: (password: string) => api.post('/auth/2fa/disable', { password }),
    onSuccess: () => { refetchMe(); setShow2FADisable(false); setDisablePassword(''); Alert.alert('2FA desactivado'); },
    onError: (err: any) => Alert.alert('Contraseña incorrecta', err.response?.data?.message ?? 'Error'),
  });

  const linkRun = useMutation({
    mutationFn: (value: string) => api.post('/players/me/run-link', { value }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me-profile'] }); setRunValue(''); Alert.alert('RUN vinculado'); },
    onError: (err: any) => Alert.alert('No se pudo vincular', err.response?.data?.message ?? 'Error'),
  });

  const refreshRun = useMutation({
    mutationFn: () => api.post('/players/me/run-link/refresh'),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      Alert.alert('RUN', res.data?.message ?? 'Actualizado');
    },
    onError: (err: any) => Alert.alert('No se pudo actualizar', err.response?.data?.message ?? 'Error'),
  });

  const unlinkRun = useMutation({
    mutationFn: () => api.delete('/players/me/run-link'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me-profile'] }); Alert.alert('RUN desvinculado'); },
    onError: (err: any) => Alert.alert('No se pudo desvincular', err.response?.data?.message ?? 'Error'),
  });

  const { data: myChildrenData, refetch: refetchChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: async () => { const { data } = await api.get('/players/me/children'); return data as any[]; },
  });

  const handleRequestLink = async () => {
    if (!childRut.trim()) return;
    setRequestingLink(true);
    try {
      await api.post('/players/me/children/request-link', { childRut: childRut.trim() });
      setChildRut('');
      refetchChildren();
      Alert.alert('Solicitud enviada', 'La solicitud está pendiente de aprobación por el club del menor.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar la solicitud');
    } finally {
      setRequestingLink(false);
    }
  };

  const updateVisibility = useMutation({
    mutationFn: (payload: any) => api.patch('/players/me/availability/settings', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo actualizar'),
  });

  const profile = me?.playerProfile;
  const stats = profile?.stats;
  const myChildren = myChildrenData ?? [];
  const memberships = myMemberships ?? [];
  const membershipRequests = myMembershipRequests ?? [];

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar tu foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert('Archivo muy grande', 'La imagen no puede superar los 5 MB.');
      return;
    }
    setAvatarUploading(true);
    const form = new FormData();
    form.append('file', { uri: asset.uri, name: `avatar.${ext}`, type: mimeMap[ext] ?? 'image/jpeg' } as any);
    try {
      await api.post('/players/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      Alert.alert('Foto actualizada', 'Tu avatar se actualizó correctamente.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'Error al subir la imagen');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const displayName = profile?.displayName ?? user?.email ?? 'Jugador';
  const rank = rankingEntry?.rank;
  const division = home.activeMemberships?.[0]?.rosterEntry?.division;
  const levelLabel = LEVEL_LABELS[profile?.level ?? ''] ?? 'Nivel Oro';

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Hero card — image 13 style */}
      <View style={s.heroCard}>
        {/* Avatar */}
        <TouchableOpacity onPress={handleAvatarPress} style={s.avatarWrapper} activeOpacity={0.85}>
          {profile?.profilePhotoUrl ? (
            <Image source={{ uri: profile.profilePhotoUrl }} style={s.avatarImage} />
          ) : (
            <View style={s.avatarCircle}>
              <Text style={s.avatarInitials}>{initials(displayName)}</Text>
            </View>
          )}
          <View style={s.cameraOverlay}>
            {avatarUploading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="camera" size={12} color="#fff" />}
          </View>
        </TouchableOpacity>

        <Text style={s.heroName}>{displayName}</Text>
        <Text style={s.heroSub}>
          {division ? `Categoría: ${division} · ` : ''}
          {levelLabel}
        </Text>

        {/* Ranking badge */}
        {rank && (
          <View style={s.rankBadge}>
            <Ionicons name="trophy" size={13} color="#0a0f1a" />
            <Text style={s.rankBadgeText}>Ranking #{rank}</Text>
          </View>
        )}
      </View>

      {/* canTransact restriction */}
      {profile?.canTransact === false && (
        <View style={s.restrictionBanner}>
          <Ionicons name="lock-closed-outline" size={16} color="#d97706" />
          <Text style={s.restrictionText}>
            Esta cuenta no puede realizar transacciones. Contacta a un tutor o al staff del club.
          </Text>
        </View>
      )}

      {/* Datos competitivos grid */}
      <View style={s.statsRow}>
        {[
          { label: 'Partidos', value: stats?.matchesPlayed ?? myStats?.matchesPlayed ?? 0 },
          { label: 'Victorias', value: stats?.wins ?? myStats?.wins ?? 0 },
          { label: 'Puntos',   value: rankingEntry?.totalPoints ?? stats?.rankingPoints ?? 0 },
        ].map(({ label, value }) => (
          <View key={label} style={s.statCell}>
            <Text style={s.statValue}>{typeof value === 'number' ? value.toLocaleString('es-CL') : value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Public stats card */}
      {myStats?.statsCard && (
        <Section title="Mi tarjeta pública">
          <View style={s.card}>
            <Text style={s.cardTitle}>{myStats.statsCard.title}</Text>
            <Text style={s.cardSub}>
              {myStats.statsCard.summary.matchesPlayed} partidos · {myStats.statsCard.summary.wins} victorias · {myStats.statsCard.summary.rankingPoints} pts
            </Text>
            <TouchableOpacity style={s.cardLink} onPress={() => router.push(`/player/${me?.id}` as any)}>
              <Ionicons name="open-outline" size={14} color={GOLD} />
              <Text style={s.cardLinkText}>Abrir vista pública y compartir</Text>
            </TouchableOpacity>
          </View>
        </Section>
      )}

      {/* Memberships */}
      <Section title="Mis membresías">
        {memberships.length === 0 ? (
          <View style={s.noClubCard}>
            <View style={s.noClubIconWrap}>
              <Ionicons name="business-outline" size={24} color={GOLD} />
            </View>
            <Text style={s.noClubTitle}>Aún no eres parte de un club</Text>
            <Text style={s.noClubSub}>Explora clubes y solicita tu membresía.</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <TouchableOpacity style={s.noClubBtn} onPress={() => router.push('/(tabs)/explore' as any)}>
                <Ionicons name="search" size={14} color="#0a0f1a" />
                <Text style={s.noClubBtnText}>Explorar clubes</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : memberships.map((m: any) => (
          <View key={m.id} style={s.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.memberTitle}>{m.club?.name}</Text>
              <Text style={s.memberSub}>{m.plan?.name} · {m.status === 'ACTIVE' ? 'Activa' : m.status}</Text>
              {m.endDate && <Text style={s.memberMeta}>Vigente hasta {new Date(m.endDate).toLocaleDateString('es-CL')}</Text>}
              {m.resolvedPaymentInstructions && <Text style={s.memberInstructions}>{m.resolvedPaymentInstructions}</Text>}
            </View>
            <View style={[s.memberBadge, m.status === 'ACTIVE' ? s.memberBadgeActive : s.memberBadgeInactive]}>
              <Text style={[s.memberBadgeText, { color: m.status === 'ACTIVE' ? GREEN : SUB }]}>
                {m.status === 'ACTIVE' ? 'Activa' : m.status}
              </Text>
            </View>
          </View>
        ))}

        {membershipRequests.length > 0 && membershipRequests.map((r: any) => (
          <View key={r.id} style={[s.memberRow, { marginTop: 6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.memberTitle}>{r.club?.name}</Text>
              <Text style={s.memberSub}>{r.plan?.name}</Text>
              {r.denialReason && <Text style={s.memberMeta}>Motivo: {r.denialReason}</Text>}
            </View>
            <Text style={[s.memberBadgeText, { color: r.status === 'PENDING' ? GOLD : r.status === 'APPROVED' ? GREEN : RED }]}>
              {r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}
            </Text>
          </View>
        ))}
      </Section>

      {/* Reservas recientes */}
      <Section title="Mis reservas recientes">
        {!myReservations?.data?.length ? (
          <Text style={s.emptyText}>Sin reservas</Text>
        ) : myReservations.data.slice(0, 3).map((r: any) => (
          <View key={r.id} style={s.itemRow}>
            <View style={s.itemIcon}><Ionicons name="tennisball-outline" size={18} color={GREEN} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{r.court?.name}</Text>
              <Text style={s.itemSub}>
                {new Date(r.startTime).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                {' · '}{new Date(r.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: r.status === 'CONFIRMED' ? GREEN : '#d97706' }]} />
          </View>
        ))}
      </Section>

      {/* Registro personal */}
      <Section title="Registro personal">
        <MenuItem icon="clipboard-outline" label="Mi registro de partidos" onPress={() => router.push('/match-log' as any)} />
      </Section>

      {/* RUN */}
      <Section title="National Ranking (RUN)">
        {profile?.runPlayerId ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Perfil vinculado: #{profile.runPlayerId}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {[
                { v: profile.runRankCached ?? '?', l: 'RUN' },
                { v: profile.runPointsCached ?? '?', l: 'Puntos' },
                { v: profile.runAtpPointsCached ?? '?', l: 'ATP' },
              ].map(({ v, l }) => (
                <View key={l} style={s.runStat}>
                  <Text style={s.runStatValue}>{v}</Text>
                  <Text style={s.runStatLabel}>{l}</Text>
                </View>
              ))}
            </View>
            <Text style={s.cardSub}>Última sincronización: {profile.runLastSyncedAt ? new Date(profile.runLastSyncedAt).toLocaleString('es-CL') : 'Sin sincronizar'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={s.runBtn} onPress={() => refreshRun.mutate()} disabled={refreshRun.isPending}>
                <Text style={s.runBtnText}>{refreshRun.isPending ? 'Actualizando...' : 'Actualizar RUN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.runBtnAlt} onPress={() => unlinkRun.mutate()} disabled={unlinkRun.isPending}>
                <Text style={s.runBtnAltText}>Desvincular</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.cardSub}>Pega tu URL o ID de perfil público de TenisChile.</Text>
            <TextInput
              style={s.input}
              value={runValue}
              onChangeText={setRunValue}
              placeholder="https://www.tenischile.com/jugador/..."
              placeholderTextColor={SUB}
            />
            <TouchableOpacity style={[s.runBtn, { marginTop: 0 }]} onPress={() => linkRun.mutate(runValue)} disabled={!runValue || linkRun.isPending}>
              <Text style={s.runBtnText}>{linkRun.isPending ? 'Vinculando...' : 'Vincular RUN'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Section>

      {/* Mi Club links */}
      <Section title="Mi Club">
        <MenuItem icon="podium-outline" label="Ver ranking interno del club" onPress={() => router.push('/torneos/ranking' as any)} />
        <MenuItem icon="trophy-outline" label="Ir a Torneos" onPress={() => router.push('/(tabs)/tournaments' as any)} />
      </Section>

      {/* Mis hijos */}
      <Section title="Mis hijos vinculados">
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={childRut}
            onChangeText={setChildRut}
            placeholder="RUT del menor (ej: 12.345.678-9)"
            placeholderTextColor={SUB}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[s.runBtn, { marginTop: 0, paddingHorizontal: 14 }, (!childRut.trim() || requestingLink) && { opacity: 0.5 }]}
            onPress={handleRequestLink}
            disabled={!childRut.trim() || requestingLink}
          >
            {requestingLink
              ? <ActivityIndicator color="#0a0f1a" size="small" />
              : <Text style={s.runBtnText}>Solicitar</Text>}
          </TouchableOpacity>
        </View>
        {myChildren.length === 0 ? (
          <Text style={s.emptyText}>Sin hijos vinculados</Text>
        ) : myChildren.map((c: any) => {
          const sColor = c.status === 'APPROVED' ? GREEN : c.status === 'PENDING' ? GOLD : RED;
          const sLabel = c.status === 'APPROVED' ? 'Aprobado' : c.status === 'PENDING' ? 'Pendiente' : 'Rechazado';
          return (
            <View key={c.linkId} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{c.child.profile?.displayName ?? c.child.email}</Text>
                <Text style={s.itemSub}>{c.club?.name}</Text>
                {c.status === 'APPROVED' && c.child.profile?.canTransact === false && (
                  <Text style={{ fontSize: 11, color: RED, marginTop: 2 }}>Transacciones bloqueadas</Text>
                )}
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: sColor }}>{sLabel}</Text>
            </View>
          );
        })}
      </Section>

      {/* Mi cuenta */}
      <Section title="Mi cuenta">
        {[
          { label: 'Cambiar foto',                    icon: 'camera-outline',             onPress: handleAvatarPress },
          { label: 'Mis pagos',                       icon: 'card-outline',               onPress: () => {} },
          { label: 'Mis favoritos',                   icon: 'heart-outline',              onPress: () => router.push('/favorites' as any) },
          { label: 'Preferencias de notificaciones',  icon: 'options-outline',            onPress: () => router.push('/notifications-settings' as any) },
          { label: 'Notificaciones',                  icon: 'notifications-outline',      onPress: () => router.push('/notifications' as any) },
        ].map(({ label, icon, onPress }) => (
          <MenuItem key={label} icon={icon as any} label={label} onPress={onPress} />
        ))}
      </Section>

      {/* Privacidad */}
      <Section title="Privacidad">
        {[
          { key: 'publicVisibility',      label: 'Perfil público',                   value: !!profile?.publicVisibility,      hint: 'Permite que otros jugadores encuentren tu perfil.' },
          { key: 'shareStatsWithClub',    label: 'Compartir stats con mi club',      value: !!profile?.shareStatsWithClub,    hint: 'Estadísticas visibles para staff del club.' },
          { key: 'shareStatsWithPlayers', label: 'Compartir stats con jugadores',    value: !!profile?.shareStatsWithPlayers, hint: 'Tarjeta pública visible para otros jugadores.' },
        ].map(item => (
          <View key={item.key} style={s.privacyItem}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{item.label}</Text>
              <Text style={s.itemSub}>{item.hint}</Text>
            </View>
            <Switch
              value={item.value}
              onValueChange={next => updateVisibility.mutate({ [item.key]: next })}
              trackColor={{ false: BORDER, true: GOLD }}
              disabled={updateVisibility.isPending}
            />
          </View>
        ))}
      </Section>

      {/* Seguridad */}
      <Section title="Seguridad">
        <View style={s.itemRow}>
          <View style={s.itemIcon}><Ionicons name="shield-outline" size={18} color={GOLD} /></View>
          <Text style={[s.itemTitle, { flex: 1 }]}>Verificación en 2 pasos</Text>
          <Switch
            value={!!me?.twoFactorEnabled}
            onValueChange={val => {
              if (val) {
                Alert.alert('Activar 2FA', 'Se enviará un código a tu email. ¿Continuar?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Activar', onPress: () => enable2FA.mutate() },
                ]);
              } else {
                setShow2FADisable(true);
              }
            }}
            trackColor={{ false: BORDER, true: GOLD }}
            disabled={enable2FA.isPending}
          />
        </View>
        {show2FADisable && (
          <View style={s.formBox}>
            <Text style={s.formHint}>Ingresa tu contraseña para desactivar 2FA:</Text>
            <TextInput
              style={s.input}
              value={disablePassword}
              onChangeText={setDisablePassword}
              placeholder="Contraseña"
              placeholderTextColor={SUB}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.formCancelBtn} onPress={() => { setShow2FADisable(false); setDisablePassword(''); }}>
                <Text style={s.formCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.formConfirmBtn, disable2FA.isPending && { opacity: 0.6 }]}
                onPress={() => disable2FA.mutate(disablePassword)}
                disabled={!disablePassword || disable2FA.isPending}
              >
                {disable2FA.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.formConfirmText}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Section>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={RED} />
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MenuItem({ icon, label, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={s.menuIconWrap}><Ionicons name={icon} size={18} color={GOLD} /></View>
      <Text style={s.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={SUB} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  heroCard: {
    alignItems: 'center', paddingTop: 60, paddingBottom: 28, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatarImage: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: GOLD },
  avatarCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#1a2235', borderWidth: 2, borderColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { fontSize: 30, fontWeight: '800', color: GOLD },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: GOLD,
  },
  heroName: { fontSize: 22, fontWeight: '800', color: TEXT, marginBottom: 4 },
  heroSub: { fontSize: 13, color: SUB, marginBottom: 12 },
  rankBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GOLD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  rankBadgeText: { fontSize: 13, fontWeight: '800', color: '#0a0f1a' },

  restrictionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1400', borderLeftWidth: 3, borderLeftColor: '#d97706',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  restrictionText: { flex: 1, fontSize: 12, color: '#d97706', lineHeight: 17 },

  statsRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 18,
    borderRightWidth: 1, borderRightColor: BORDER,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: TEXT },
  statLabel: { fontSize: 12, color: SUB, marginTop: 3 },

  section: { margin: 16, marginTop: 14, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },

  card: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  cardSub: { fontSize: 12, color: SUB, lineHeight: 18 },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  cardLinkText: { fontSize: 13, fontWeight: '700', color: GOLD },

  noClubCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 16, gap: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  noClubIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#1a2235', justifyContent: 'center', alignItems: 'center',
  },
  noClubTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  noClubSub: { fontSize: 13, color: SUB },
  noClubBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  noClubBtnText: { fontSize: 13, fontWeight: '700', color: '#0a0f1a' },

  memberRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  memberTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  memberSub: { fontSize: 12, color: SUB, marginTop: 3 },
  memberMeta: { fontSize: 12, color: SUB, marginTop: 3 },
  memberInstructions: { fontSize: 12, color: GREEN, marginTop: 4, lineHeight: 17 },
  memberBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  memberBadgeActive: { backgroundColor: GREEN + '22' },
  memberBadgeInactive: { backgroundColor: '#1f2937' },
  memberBadgeText: { fontSize: 11, fontWeight: '700' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  itemIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#1a2235', justifyContent: 'center', alignItems: 'center',
  },
  itemTitle: { fontSize: 14, fontWeight: '600', color: TEXT },
  itemSub: { fontSize: 12, color: SUB, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  menuIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#1a2235', justifyContent: 'center', alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT },

  privacyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },

  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: TEXT, backgroundColor: '#0d1526',
  },
  formBox: { backgroundColor: '#160c0c', borderRadius: 12, padding: 14, gap: 10 },
  formHint: { fontSize: 13, color: SUB },
  formCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', backgroundColor: CARD,
  },
  formCancelText: { fontSize: 13, fontWeight: '600', color: TEXT },
  formConfirmBtn: { flex: 1, backgroundColor: RED, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  formConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  runStat: {
    flex: 1, backgroundColor: '#1a2235', borderRadius: 10, padding: 10, alignItems: 'center',
  },
  runStatValue: { fontSize: 20, fontWeight: '800', color: GOLD },
  runStatLabel: { fontSize: 11, color: SUB, marginTop: 2 },
  runBtn: {
    backgroundColor: GOLD, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', flex: 1, paddingHorizontal: 8,
  },
  runBtnText: { color: '#0a0f1a', fontWeight: '700', fontSize: 13 },
  runBtnAlt: {
    backgroundColor: '#160c0c', borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', flex: 1, borderWidth: 1, borderColor: RED,
  },
  runBtnAltText: { color: RED, fontWeight: '700', fontSize: 13 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 14, borderRadius: 12,
    backgroundColor: '#160c0c', borderWidth: 1, borderColor: '#2d1414',
  },
  logoutText: { fontSize: 14, color: RED, fontWeight: '700' },
  emptyText: { color: SUB, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
