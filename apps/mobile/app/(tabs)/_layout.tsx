import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const GOLD = '#d4a017';
const INACTIVE = '#6b7280';
const TAB_BG = '#0a0f1a';

const tabs: Array<{ name: string; title: string; icon: IoniconsName; activeIcon: IoniconsName }> = [
  { name: 'index',       title: 'Inicio',     icon: 'home-outline',     activeIcon: 'home' },
  { name: 'calendar',    title: 'Calendario', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'tournaments', title: 'Torneos',    icon: 'trophy-outline',   activeIcon: 'trophy' },
  { name: 'profile',     title: 'Perfil',     icon: 'person-outline',   activeIcon: 'person' },
  { name: 'mas',         title: 'Más',        icon: 'ellipsis-horizontal-outline', activeIcon: 'ellipsis-horizontal' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 4,
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      {tabs.map(({ name, title, icon, activeIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? activeIcon : icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
