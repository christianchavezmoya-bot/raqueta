import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const tabs: Array<{ name: string; title: string; icon: IoniconsName; activeIcon: IoniconsName }> = [
  { name: 'index', title: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
  { name: 'explore', title: 'Explorar', icon: 'search-outline', activeIcon: 'search' },
  { name: 'calendar', title: 'Calendario', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'tournaments', title: 'Torneos', icon: 'trophy-outline', activeIcon: 'trophy' },
  { name: 'profile', title: 'Perfil', icon: 'person-outline', activeIcon: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f3f4f6',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
