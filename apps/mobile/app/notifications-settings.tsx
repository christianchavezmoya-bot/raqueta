import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useMyNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../src/hooks/use-favorites';

type CategoryDef = {
  key: 'notifyEvents' | 'notifyOffers' | 'notifyMembershipOffers' | 'notifyMatchFinding';
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

const CATEGORIES: CategoryDef[] = [
  {
    key: 'notifyEvents',
    label: 'Eventos',
    description: 'Torneos, clínicas, clases y actividades del club.',
    icon: 'calendar-outline',
    accent: '#1b4a86',
  },
  {
    key: 'notifyOffers',
    label: 'Ofertas generales',
    description: 'Promociones, descuentos y novedades comerciales.',
    icon: 'pricetag-outline',
    accent: '#d97706',
  },
  {
    key: 'notifyMembershipOffers',
    label: 'Ofertas de membresía',
    description: 'Promos exclusivas para socios y nuevos planes.',
    icon: 'ribbon-outline',
    accent: '#7c3aed',
  },
  {
    key: 'notifyMatchFinding',
    label: 'Búsqueda de partidos',
    description: 'Nudges para encontrar rivales y completar partidos abiertos.',
    icon: 'tennisball-outline',
    accent: '#16a34a',
  },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { data: prefs, isLoading } = useMyNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (isLoading || !prefs) {
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
        <Text style={s.title}>Notificaciones</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.lead}>
          Decide qué categorías de anuncios quieres recibir de tus clubes favoritos.
          Silenciar una categoría no afecta a las demás.
        </Text>

        <View style={s.section}>
          {CATEGORIES.map(cat => (
            <View key={cat.key} style={s.row}>
              <View style={[s.iconWrap, { backgroundColor: `${cat.accent}14` }]}>
                <Ionicons name={cat.icon} size={20} color={cat.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{cat.label}</Text>
                <Text style={s.rowHint}>{cat.description}</Text>
              </View>
              <Switch
                value={prefs[cat.key]}
                onValueChange={value =>
                  update.mutate(
                    { [cat.key]: value },
                    {
                      onError: (err: any) =>
                        Alert.alert(
                          'Error',
                          err?.response?.data?.message ?? 'No se pudo guardar',
                        ),
                    },
                  )
                }
                trackColor={{ false: '#d1d5db', true: '#16a34a' }}
                disabled={update.isPending}
              />
            </View>
          ))}
        </View>

        <View style={s.callout}>
          <Ionicons name="information-circle-outline" size={18} color="#92400e" />
          <Text style={s.calloutText}>
            <Text style={{ fontWeight: '700' }}>Solo afecta anuncios por categoría.</Text>{' '}
            Las notificaciones transaccionales —confirmaciones de reserva, códigos de
            verificación en 2 pasos, confirmaciones de pago, invitaciones directas de
            partido, aprobaciones de vínculo padre-hijo, cambios de rol— siempre
            llegan independientemente de esta configuración.
          </Text>
        </View>

        <View style={s.linkCard}>
          <TouchableOpacity
            style={s.linkRow}
            onPress={() => router.push('/favorites' as any)}
            activeOpacity={0.85}
          >
            <View style={[s.iconWrap, { backgroundColor: '#fff1f2' }]}>
              <Ionicons name="heart-outline" size={20} color="#e11d48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Mis clubes favoritos</Text>
              <Text style={s.rowHint}>
                Gestiona qué clubes sigues y reciben tus notificaciones.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  lead: { fontSize: 13, color: '#374151', lineHeight: 19 },
  section: {
    backgroundColor: '#fff', borderRadius: 14, padding: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  rowLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowHint: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 },
  callout: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#fff7ed', borderLeftWidth: 4, borderLeftColor: '#d97706',
    padding: 14, borderRadius: 12,
  },
  calloutText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },
  linkCard: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
  },
});
