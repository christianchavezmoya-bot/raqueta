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

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [show2FADisable, setShow2FADisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [runValue, setRunValue] = useState('');

  const { data: me, refetch: refetchMe } = useQuery({
    queryKey: ['me-profile'],
    queryFn: async () => { const { data } = await api.get('/auth/me'); return data; },
  });

  const { data: myReservations } = useQuery({
    queryKey: ['my-reservations-profile'],
    queryFn: async () => { const { data } = await api.get('/users/me/reservations?limit=5'); return data; },
  });

  const enable2FA = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable'),
    onSuccess: () => { refetchMe(); Alert.alert('2FA activado', 'Se envió un código a tu email para confirmar. En el próximo login, necesitarás el código.'); },
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

  const profile = me?.playerProfile;
  const stats = profile?.stats;

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar tu foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mimeType = mimeMap[ext] ?? 'image/jpeg';

    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert('Archivo muy grande', 'La imagen no puede superar los 5 MB.');
      return;
    }

    setAvatarUploading(true);
    const form = new FormData();
    form.append('file', { uri: asset.uri, name: `avatar.${ext}`, type: mimeType } as any);

    try {
      await api.post('/players/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      Alert.alert('Foto actualizada', 'Tu avatar se actualizó correctamente.');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Error al subir la imagen';
      Alert.alert('Error', msg);
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

  const LEVEL_LABELS: Record<string, string> = {
    BEGINNER: 'Principiante',
    INTERMEDIATE: 'Intermedio',
    ADVANCED: 'Avanzado',
    COMPETITIVE: 'Competitivo',
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Profile header */}
      <View style={s.profileHeader}>
        <TouchableOpacity onPress={handleAvatarPress} style={s.avatarWrapper} activeOpacity={0.85}>
          {profile?.profilePhotoUrl ? (
            <Image source={{ uri: profile.profilePhotoUrl }} style={s.avatarImage} />
          ) : (
            <View style={s.avatarLarge}>
              <Text style={s.avatarText}>
                {(profile?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={s.cameraOverlay}>
            {avatarUploading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="camera" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
        <Text style={s.displayName}>{profile?.displayName ?? 'Tu perfil'}</Text>
        <Text style={s.email}>{me?.email}</Text>
        <View style={s.levelBadge}>
          <Text style={s.levelText}>{LEVEL_LABELS[profile?.level] ?? 'Principiante'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Partidos', value: stats?.matchesPlayed ?? 0 },
          { label: 'Victorias', value: stats?.wins ?? 0 },
          { label: 'Puntos', value: stats?.rankingPoints ?? 0 },
        ].map(({ label, value }) => (
          <View key={label} style={s.statItem}>
            <Text style={s.statValue}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Upcoming reservations */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Mis reservas recientes</Text>
        {myReservations?.data?.length === 0 ? (
          <Text style={s.emptyText}>Sin reservas</Text>
        ) : (
          myReservations?.data?.slice(0, 3).map((r: any) => (
            <View key={r.id} style={s.itemCard}>
              <View style={s.itemIcon}>
                <Ionicons name="tennisball-outline" size={18} color="#16a34a" />
              </View>
              <View style={s.itemInfo}>
                <Text style={s.itemTitle}>{r.court?.name}</Text>
                <Text style={s.itemSub}>
                  {new Date(r.startTime).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  {' · '}{new Date(r.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={[s.statusDot, { backgroundColor: r.status === 'CONFIRMED' ? '#16a34a' : '#d97706' }]} />
            </View>
          ))
        )}
      </View>

      {/* Match Log */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Registro personal</Text>
        <TouchableOpacity style={s.menuItem} onPress={() => router.push('/match-log' as any)} activeOpacity={0.7}>
          <Ionicons name="clipboard-outline" size={20} color="#7c3aed" />
          <Text style={s.menuLabel}>Mi registro de partidos</Text>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>


      <View style={s.section}>
        <Text style={s.sectionTitle}>National Ranking (RUN)</Text>
        {profile?.runPlayerId ? (
          <View style={s.runCard}>
            <Text style={s.runLabel}>Perfil vinculado: #{profile.runPlayerId}</Text>
            <View style={s.runStatsRow}>
              <View style={s.runStat}><Text style={s.runStatValue}>{profile.runRankCached ?? '?'}</Text><Text style={s.runStatLabel}>RUN</Text></View>
              <View style={s.runStat}><Text style={s.runStatValue}>{profile.runPointsCached ?? '?'}</Text><Text style={s.runStatLabel}>Puntos</Text></View>
              <View style={s.runStat}><Text style={s.runStatValue}>{profile.runAtpPointsCached ?? '?'}</Text><Text style={s.runStatLabel}>ATP</Text></View>
            </View>
            <Text style={s.runHint}>?ltima actualizaci?n: {profile.runLastSyncedAt ? new Date(profile.runLastSyncedAt).toLocaleString('es-CL') : 'Sin sincronizar'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={s.runRefreshBtn} onPress={() => refreshRun.mutate()} disabled={refreshRun.isPending}>
                <Text style={s.runRefreshText}>{refreshRun.isPending ? 'Actualizando...' : 'Actualizar RUN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.runUnlinkBtn} onPress={() => unlinkRun.mutate()} disabled={unlinkRun.isPending}>
                <Text style={s.runUnlinkText}>Desvincular</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.runCard}>
            <Text style={s.runHint}>Pega tu URL o ID de perfil p?blico de TenisChile.</Text>
            <TextInput
              style={s.disableInput}
              value={runValue}
              onChangeText={setRunValue}
              placeholder="https://www.tenischile.com/jugador/..."
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity style={s.runRefreshBtn} onPress={() => linkRun.mutate(runValue)} disabled={!runValue || linkRun.isPending}>
              <Text style={s.runRefreshText}>{linkRun.isPending ? 'Vinculando...' : 'Vincular RUN'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Mi Club</Text>
        <TouchableOpacity style={s.menuItem} onPress={() => router.push('/club-ranking' as any)} activeOpacity={0.7}>
          <Ionicons name="podium-outline" size={20} color="#16a34a" />
          <Text style={s.menuLabel}>Ver ranking interno del club</Text>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {/* Menu */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Mi cuenta</Text>
        {[
          { label: 'Cambiar foto', icon: 'camera-outline', onPress: handleAvatarPress },
          { label: 'Mis pagos', icon: 'card-outline', onPress: () => {} },
          { label: 'Mis membresías', icon: 'shield-checkmark-outline', onPress: () => {} },
          { label: 'Notificaciones', icon: 'notifications-outline', onPress: () => {} },
        ].map(({ label, icon, onPress }) => (
          <TouchableOpacity key={label} style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
            <Ionicons name={icon as any} size={20} color="#374151" />
            <Text style={s.menuLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 2FA section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Seguridad</Text>
        <View style={s.menuItem}>
          <Ionicons name="shield-outline" size={20} color="#374151" />
          <Text style={s.menuLabel}>Verificación en 2 pasos</Text>
          <Switch
            style={{ marginLeft: 'auto' }}
            value={!!me?.twoFactorEnabled}
            onValueChange={val => {
              if (val) {
                Alert.alert('Activar 2FA', 'Se enviará un código a tu email para verificar. ¿Continuar?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Activar', onPress: () => enable2FA.mutate() },
                ]);
              } else {
                setShow2FADisable(true);
              }
            }}
            trackColor={{ false: '#d1d5db', true: '#16a34a' }}
            disabled={enable2FA.isPending}
          />
        </View>
        {show2FADisable && (
          <View style={s.disableForm}>
            <Text style={s.disableHint}>Ingresa tu contraseña para desactivar 2FA:</Text>
            <TextInput
              style={s.disableInput}
              value={disablePassword}
              onChangeText={setDisablePassword}
              placeholder="Contraseña"
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.disableCancelBtn} onPress={() => { setShow2FADisable(false); setDisablePassword(''); }}>
                <Text style={s.disableCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.disableConfirmBtn, disable2FA.isPending && { opacity: 0.6 }]}
                onPress={() => disable2FA.mutate(disablePassword)}
                disabled={!disablePassword || disable2FA.isPending}
              >
                {disable2FA.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.disableConfirmText}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  profileHeader: { backgroundColor: '#16a34a', alignItems: 'center', paddingTop: 60, paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#16a34a',
  },
  displayName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  email: { fontSize: 14, color: '#bbf7d0', marginTop: 4 },
  levelBadge: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  levelText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 18, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  section: { margin: 16, marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  menuLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca', marginBottom: 8 },
  logoutText: { fontSize: 15, color: '#dc2626', fontWeight: '600' },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  disableForm: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, marginTop: 8, gap: 10 },
  disableHint: { fontSize: 13, color: '#374151' },
  disableInput: { borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fff' },
  disableCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  disableCancelText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  disableConfirmBtn: { flex: 1, backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  disableConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  runCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  runLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  runHint: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  runStatsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  runStat: { flex: 1, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, alignItems: 'center' },
  runStatValue: { fontSize: 20, fontWeight: '800', color: '#166534' },
  runStatLabel: { fontSize: 12, color: '#166534', marginTop: 3 },
  runRefreshBtn: { marginTop: 12, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flex: 1 },
  runRefreshText: { color: '#fff', fontWeight: '700' },
  runUnlinkBtn: { marginTop: 12, backgroundColor: '#fff5f5', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flex: 1, borderWidth: 1, borderColor: '#fecaca' },
  runUnlinkText: { color: '#dc2626', fontWeight: '700' },
});
