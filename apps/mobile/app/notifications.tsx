import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../src/lib/api';

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications');
      return data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/notifications/${id}/read`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>Notificaciones</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={item => item.id}
          contentContainerStyle={data?.length ? s.list : s.emptyWrap}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, !item.readAt && s.cardUnread]}
              onPress={() => !item.readAt && markRead.mutate(item.id)}
              activeOpacity={0.85}
            >
              <View style={s.cardHeader}>
                <Text style={s.cardTitle}>{item.title}</Text>
                {!item.readAt && <View style={s.unreadDot} />}
              </View>
              <Text style={s.cardBody}>{item.message}</Text>
              <Text style={s.cardDate}>{new Date(item.createdAt).toLocaleString('es-CL')}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>No tienes notificaciones todavía.</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingTop: 58,
    paddingBottom: 18,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardUnread: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16a34a' },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 21, color: '#4b5563' },
  cardDate: { marginTop: 10, fontSize: 12, color: '#9ca3af' },
  emptyText: { fontSize: 14, color: '#9ca3af' },
});