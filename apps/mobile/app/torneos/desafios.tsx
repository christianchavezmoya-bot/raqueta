import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useHomeState } from '../../src/hooks/use-home-state';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const RED = '#ef4444'; const TEXT = '#f9fafb';
const SUB = '#9ca3af'; const BORDER = '#1f2937';

const TABS = ['MIS DESAFÍOS', 'HISTORIAL', 'RANKING'];

export default function DesafiosScreen() {
  const router = useRouter();
  const home = useHomeState();
  const qc = useQueryClient();
  const firstClubId = home.activeMemberships?.[0]?.club?.id;
  const [activeTab, setActiveTab] = useState('MIS DESAFÍOS');

  const { data: challenges, isLoading } = useQuery({
    queryKey: ['desafios', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return { available: [], pending: [], incoming: [], recent: [], pointsAtStake: 25 };
      const { data } = await api.get(`/clubs/${firstClubId}/challenges`);
      return data ?? { available: [], pending: [], incoming: [], recent: [], pointsAtStake: 25 };
    },
    enabled: !!firstClubId,
  });

  const { data: rankingEntries } = useQuery({
    queryKey: ['ranking-internal', firstClubId],
    queryFn: async () => {
      if (!firstClubId) return [];
      const { data } = await api.get(`/clubs/${firstClubId}/rankings/internal`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!firstClubId && activeTab === 'RANKING',
  });

  const acceptMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      const { data } = await api.post(`/clubs/${firstClubId}/challenges/${challengeId}/accept`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desafios', firstClubId] });
      Alert.alert('¡Desafío aceptado!', 'El partido quedó agendado.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo aceptar'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      const { data } = await api.post(`/clubs/${firstClubId}/challenges/${challengeId}/reject`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['desafios', firstClubId] }),
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo rechazar'),
  });

  const sendChallengeMutation = useMutation({
    mutationFn: async (targetRosterId: string) => {
      const { data } = await api.post(`/clubs/${firstClubId}/challenges`, {
        challengedRosterId: targetRosterId,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desafios', firstClubId] });
      Alert.alert('Desafío enviado', 'Tu rival recibirá una notificación.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar'),
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Torneos · Desafíos</Text>
          <Text style={s.headerSub}>Retos directos entre jugadores</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsBar} contentContainerStyle={s.tabsContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabPill, activeTab === t && s.tabPillActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[s.tabText, activeTab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : activeTab === 'MIS DESAFÍOS' ? (
          <MisDesafiosTab
            challenges={challenges}
            pointsAtStake={challenges?.pointsAtStake ?? 25}
            onSend={(rosterId, name) => {
              Alert.alert('Enviar desafío', `¿Enviar desafío a ${name} por ${challenges?.pointsAtStake ?? 25} puntos?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'ENVIAR DESAFÍO', onPress: () => sendChallengeMutation.mutate(rosterId) },
              ]);
            }}
            onAccept={(id) => acceptMutation.mutate(id)}
            onReject={(id) => {
              Alert.alert('Rechazar desafío', '¿Confirmas que quieres rechazar?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Rechazar', style: 'destructive', onPress: () => rejectMutation.mutate(id) },
              ]);
            }}
          />
        ) : activeTab === 'HISTORIAL' ? (
          <HistorialTab history={challenges?.recent ?? []} onViewMatch={(id) => router.push(`/torneos/partido/${id}` as any)} />
        ) : (
          <RankingTab entries={rankingEntries ?? []} availableRosterIds={new Set((challenges?.available ?? []).map((entry: any) => entry.rosterId))} />
        )}
      </ScrollView>
    </View>
  );
}

function MisDesafiosTab({ challenges, pointsAtStake, onSend, onAccept, onReject }: {
  challenges: any;
  pointsAtStake: number;
  onSend: (rosterId: string, name: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const available = challenges?.available ?? [];
  const pending = challenges?.pending ?? [];
  const incoming = challenges?.incoming ?? [];

  return (
    <View style={{ gap: 14 }}>
      {available.length > 0 && (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={dc.sectionLabel}>DESAFÍOS DISPONIBLES</Text>
          {available.map((c: any) => (
            <View key={c.rosterId} style={dc.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={dc.pendingFrom}>{c.name ?? 'Oponente'}</Text>
                <Text style={dc.pendingSub}>#{c.rank ?? '—'} · {c.division ?? 'Sin división'} · {pointsAtStake} pts</Text>
              </View>
              <TouchableOpacity style={dc.acceptBtn} onPress={() => onSend(c.rosterId, c.name)}>
                <Text style={dc.acceptText}>ENVIAR DESAFÍO</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {incoming.length > 0 && (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={dc.sectionLabel}>DESAFÍOS PENDIENTES</Text>
          {incoming.map((c: any) => (
            <View key={c.id} style={dc.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={dc.pendingFrom}>{c.challengerName ?? 'Oponente'}</Text>
                <Text style={dc.pendingSub}>{c.pointsAtStake ?? pointsAtStake} pts en juego</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={dc.acceptBtn} onPress={() => onAccept(c.id)}>
                  <Text style={dc.acceptText}>ACEPTAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={dc.rejectBtn} onPress={() => onReject(c.id)}>
                  <Text style={dc.rejectText}>RECHAZAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {pending.length > 0 && (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={dc.sectionLabel}>ESPERANDO RESPUESTA</Text>
          {pending.map((c: any) => (
            <View key={c.id} style={dc.histCard}>
              <View style={{ flex: 1 }}>
                <Text style={dc.histOpponent}>{c.challengedName ?? 'Oponente'}</Text>
                <Text style={dc.histDate}>Expira {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('es-CL') : 'pronto'}</Text>
              </View>
              <View style={dc.histBadge}>
                <Text style={dc.histBadgeText}>PENDIENTE</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {available.length === 0 && incoming.length === 0 && pending.length === 0 && (
        <View style={s.empty}>
          <Ionicons name="flash-outline" size={36} color={SUB} />
          <Text style={s.emptyText}>No tienes desafíos pendientes</Text>
        </View>
      )}
    </View>
  );
}

function HistorialTab({ history, onViewMatch }: { history: any[]; onViewMatch: (id: string) => void }) {
  if (history.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="time-outline" size={36} color={SUB} />
        <Text style={s.emptyText}>Sin historial de desafíos</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {history.map((c: any, i: number) => {
        const won = c.result === 'WIN';
        const completed = c.status === 'COMPLETED';
        return (
          <TouchableOpacity key={c.id ?? i} style={dc.histCard} onPress={() => c.matchResultId && onViewMatch(c.matchResultId)}>
            <View style={{ flex: 1 }}>
              <Text style={dc.histOpponent}>{c.opponentName ?? 'Oponente'}</Text>
              <Text style={dc.histDate}>
                {c.playedAt ? new Date(c.playedAt).toLocaleDateString('es-CL') : ''}
                {completed ? '' : ` · ${c.status ?? ''}`}
              </Text>
            </View>
            <View style={[dc.histBadge, completed ? { backgroundColor: won ? '#22c55e22' : '#ef444422', borderColor: won ? GREEN : RED } : null]}>
              <Text style={[dc.histBadgeText, completed ? { color: won ? GREEN : RED } : { color: SUB }]}>
                {completed ? (won ? `+${c.pointsDelta ?? 0} pts` : '0 pts') : (c.status ?? '—')}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RankingTab({ entries, availableRosterIds }: { entries: any[]; availableRosterIds: Set<string> }) {
  return (
    <View style={{ gap: 10 }}>
      {entries.map((e: any, i: number) => {
        const name = e.rosterEntry?.linkedPlayerProfile?.displayName
          ?? `${e.rosterEntry?.firstName ?? ''} ${e.rosterEntry?.lastName ?? ''}`.trim()
          ?? 'Jugador';
        const pts = e.totalPoints ?? 0;
        const challengeable = !!e.rosterEntry?.id && availableRosterIds.has(e.rosterEntry.id);
        return (
          <View key={e.id ?? i} style={dc.rankRow}>
            <Text style={dc.rankNum}>#{e.rank ?? i + 1}</Text>
            <Text style={dc.rankName} numberOfLines={1}>{name}</Text>
            <Text style={dc.rankPts}>{pts.toLocaleString('es-CL')} pts</Text>
            <View style={[dc.challengeBtn, !challengeable && { opacity: 0.45 }]}>
              <Text style={dc.challengeBtnText}>{challengeable ? 'RETABLE' : 'NO DISP.'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const dc = StyleSheet.create({
  availCard: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#d4a017',
  },
  availIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a2235', justifyContent: 'center', alignItems: 'center',
  },
  availTitle: { fontSize: 15, fontWeight: '700', color: '#f9fafb' },
  availSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  usedText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  sendBtn: {
    backgroundColor: '#d4a017', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  sendBtnText: { fontSize: 14, fontWeight: '800', color: '#0a0f1a', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 },
  pendingCard: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  pendingFrom: { fontSize: 14, fontWeight: '700', color: '#f9fafb' },
  pendingSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  acceptBtn: {
    backgroundColor: '#22c55e22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#22c55e',
  },
  acceptText: { fontSize: 11, fontWeight: '700', color: '#22c55e' },
  rejectBtn: {
    backgroundColor: '#ef444422', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#ef4444',
  },
  rejectText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  histCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#1f2937',
  },
  histOpponent: { fontSize: 14, fontWeight: '700', color: '#f9fafb' },
  histDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  histBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  histBadgeText: { fontSize: 12, fontWeight: '800' },
  rankRow: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#1f2937',
  },
  rankNum: { fontSize: 13, fontWeight: '800', color: '#d4a017', width: 28 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#f9fafb' },
  rankPts: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  challengeBtn: {
    backgroundColor: '#d4a01722', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#d4a017',
  },
  challengeBtnText: { fontSize: 11, fontWeight: '700', color: '#d4a017' },
});

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
  tabsBar: { borderBottomWidth: 1, borderBottomColor: BORDER },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  tabPillActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { fontSize: 12, fontWeight: '700', color: SUB },
  tabTextActive: { color: '#0a0f1a' },
  scroll: { padding: 16, paddingBottom: 48 },
  empty: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, color: SUB },
});
