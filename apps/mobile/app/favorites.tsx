import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useMyFavorites, useToggleFavorite } from '../src/hooks/use-favorites';

export default function FavoritesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: favorites, isLoading } = useMyFavorites();

  if (isLoading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color="#1b4a86" size="large" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>Mis favoritos</Text>
      </View>

      <FlatList
        data={favorites ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="heart-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyTitle}>Aún no tienes clubes favoritos</Text>
            <Text style={s.emptyHint}>
              Entra a la página de cualquier club y toca el corazón para seguirlo.
              Recibirás sus anuncios en las categorías que no hayas silenciado.
            </Text>
            <TouchableOpacity
              style={s.cta}
              onPress={() => router.push('/(tabs)/explore' as any)}
            >
              <Text style={s.ctaText}>Explorar clubes</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <FavoriteRow
            favoriteId={item.id}
            clubId={item.clubId}
            name={item.club.name}
            city={item.club.profile?.city ?? null}
            logoUrl={item.club.profile?.logoUrl ?? null}
            status={item.club.status}
            createdAt={item.createdAt}
            onOpen={() => router.push(`/club/${item.clubId}` as any)}
            onRemoved={() =>
              queryClient.invalidateQueries({ queryKey: ['my-favorites'] })
            }
          />
        )}
      />
    </View>
  );
}

function FavoriteRow({
  favoriteId,
  clubId,
  name,
  city,
  logoUrl,
  status,
  createdAt,
  onOpen,
  onRemoved,
}: {
  favoriteId: string;
  clubId: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
  status: string;
  createdAt: string;
  onOpen: () => void;
  onRemoved: () => void;
}) {
  const toggleFavorite = useToggleFavorite(clubId);
  const isFavorite = true;

  return (
    <View style={s.row}>
      <TouchableOpacity style={s.rowMain} onPress={onOpen} activeOpacity={0.85}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={s.logo} />
        ) : (
          <View style={s.logoPlaceholder}>
            <Ionicons name="business" size={22} color="#1b4a86" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{name}</Text>
          <Text style={s.meta}>
            {city ? `📍 ${city} · ` : ''}seguido desde{' '}
            {new Date(createdAt).toLocaleDateString('es-CL')}
          </Text>
          <Text
            style={[
              s.statusBadge,
              status === 'ACTIVE' ? s.statusActive : s.statusInactive,
            ]}
          >
            {status}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.removeBtn}
        onPress={() => {
          Alert.alert(
            'Quitar de favoritos',
            `¿Dejar de seguir a ${name}?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Quitar',
                style: 'destructive',
                onPress: () =>
                  toggleFavorite.mutate(isFavorite, {
                    onSettled: () => onRemoved(),
                  }),
              },
            ],
          );
        }}
        disabled={toggleFavorite.isPending}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Quitar ${name} de favoritos`}
      >
        <Ionicons name="heart" size={22} color="#e11d48" />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 12 },
  logoPlaceholder: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  statusBadge: {
    marginTop: 5, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
    fontSize: 10, fontWeight: '700',
  },
  statusActive: { backgroundColor: '#dcfce7', color: '#166534' },
  statusInactive: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  removeBtn: { padding: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 60 },
  emptyTitle: {
    fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 16,
  },
  emptyHint: {
    fontSize: 13, color: '#6b7280', marginTop: 8, textAlign: 'center', lineHeight: 19,
  },
  cta: {
    marginTop: 20, backgroundColor: '#1b4a86',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10,
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
