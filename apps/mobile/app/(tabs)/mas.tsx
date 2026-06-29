import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/auth.store';

const BG = '#0a0f1a';
const CARD = '#111827';
const GOLD = '#d4a017';
const TEXT = '#f9fafb';
const SUB = '#9ca3af';
const BORDER = '#1f2937';
const RED = '#ef4444';

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
};

export default function MasScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const menuItems: MenuItem[] = [
    { icon: 'person-circle-outline', label: 'Mi Perfil', onPress: () => router.push('/(tabs)/profile') },
    { icon: 'notifications-outline', label: 'Notificaciones', onPress: () => router.push('/notifications' as any) },
    { icon: 'search-outline', label: 'Explorar clubes y canchas', onPress: () => router.push('/(tabs)/explore' as any) },
    { icon: 'settings-outline', label: 'Configuración', onPress: () => router.push('/notifications-settings' as any) },
    { icon: 'help-circle-outline', label: 'Ayuda y Soporte', onPress: () => {} },
    { icon: 'document-text-outline', label: 'Términos y Condiciones', onPress: () => {} },
  ];

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.clubRow}>
          <View style={s.clubIcon}><Text style={s.clubIconText}>T</Text></View>
          <View>
            <Text style={s.clubSmall}>CLUB DE TENIS</Text>
            <Text style={s.clubName}>DOMOS DE BATUCO</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Más</Text>
        <Text style={s.subtitle}>Configuración y soporte</Text>

        <View style={s.menuList}>
          {menuItems.map((item) => (
            <TouchableOpacity key={item.label} style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
              <View style={s.menuIconWrap}>
                <Ionicons name={item.icon} size={22} color={item.color ?? GOLD} />
              </View>
              <Text style={[s.menuLabel, item.color ? { color: item.color } : {}]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={SUB} />
            </TouchableOpacity>
          ))}

          {/* Logout */}
          <TouchableOpacity style={[s.menuItem, { marginTop: 8 }]} onPress={handleLogout} activeOpacity={0.7}>
            <View style={[s.menuIconWrap, { backgroundColor: '#1a0a0a' }]}>
              <Ionicons name="log-out-outline" size={22} color={RED} />
            </View>
            <Text style={[s.menuLabel, { color: RED }]}>Cerrar Sesión</Text>
            <Ionicons name="chevron-forward" size={16} color={SUB} />
          </TouchableOpacity>
        </View>

        {/* Info note */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Información</Text>
          <Text style={s.infoText}>
            Esta sección queda igual a la app actual. Las nuevas páginas competitivas viven dentro de Torneos.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center',
  },
  clubIconText: { fontSize: 16, fontWeight: '800', color: '#0a0f1a' },
  clubSmall: { fontSize: 10, color: SUB, fontWeight: '600', letterSpacing: 0.5 },
  clubName: { fontSize: 13, color: TEXT, fontWeight: '800', letterSpacing: 0.3 },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '800', color: TEXT, marginBottom: 2 },
  subtitle: { fontSize: 14, color: SUB, marginBottom: 24 },
  menuList: { gap: 8 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  menuIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#1a2235', justifyContent: 'center', alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT },
  infoCard: {
    marginTop: 28, backgroundColor: CARD, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: GOLD, marginBottom: 6 },
  infoText: { fontSize: 13, color: SUB, lineHeight: 19 },
});
