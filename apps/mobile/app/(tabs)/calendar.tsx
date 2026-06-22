import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const { data: calendar, isLoading } = useQuery({
    queryKey: ['calendar-user', selectedDate.toISOString().split('T')[0]],
    queryFn: async () => {
      const from = new Date(selectedDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(selectedDate);
      to.setHours(23, 59, 59, 999);
      const { data } = await api.get(`/calendar/user?from=${from.toISOString()}&to=${to.toISOString()}`);
      return data;
    },
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const allEvents = [
    ...(calendar?.reservations ?? []),
    ...(calendar?.matches ?? []),
    ...(calendar?.tournaments ?? []),
  ].sort((a, b) => new Date(a.startTime ?? a.startDate ?? a.scheduledTime).getTime()
    - new Date(b.startTime ?? b.startDate ?? b.scheduledTime).getTime());

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Mi Calendario</Text>
      </View>

      {/* Week picker */}
      <View style={s.weekRow}>
        {weekDays.map(day => {
          const active = format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
          return (
            <TouchableOpacity key={day.toISOString()} style={[s.dayBtn, active && s.dayBtnActive]} onPress={() => setSelectedDate(day)}>
              <Text style={[s.dayName, active && s.dayNameActive]}>
                {format(day, 'EEE', { locale: es }).substring(0, 3)}
              </Text>
              <Text style={[s.dayNum, active && s.dayNumActive]}>{format(day, 'd')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.dateLabel}>
          {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
        </Text>

        {isLoading ? (
          <ActivityIndicator color="#16a34a" style={{ marginTop: 32 }} />
        ) : allEvents.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>Sin eventos para este día</Text>
          </View>
        ) : (
          allEvents.map((event: any, i) => {
            const isReservation = event.type === 'RESERVATION';
            const isMatch = event.type === 'MATCH';
            const color = isReservation ? '#16a34a' : isMatch ? '#d97706' : '#7c3aed';
            const bgColor = isReservation ? '#f0fdf4' : isMatch ? '#fffbeb' : '#faf5ff';
            const time = event.startTime
              ? format(new Date(event.startTime), 'HH:mm')
              : event.scheduledTime
              ? format(new Date(event.scheduledTime), 'HH:mm')
              : format(new Date(event.startDate), 'dd/MM');

            return (
              <View key={event.id + i} style={[s.eventCard, { borderLeftColor: color }]}>
                <View style={[s.eventDot, { backgroundColor: bgColor }]}>
                  <Ionicons
                    name={isReservation ? 'tennisball' : isMatch ? 'flash' : 'trophy'}
                    size={16}
                    color={color}
                  />
                </View>
                <View style={s.eventInfo}>
                  <Text style={s.eventTime}>{time}</Text>
                  <Text style={s.eventTitle}>
                    {isReservation
                      ? event.court?.name ?? 'Reserva'
                      : isMatch
                      ? 'Partido'
                      : event.name}
                  </Text>
                  {isReservation && (
                    <Text style={s.eventSub}>{event.club?.profile?.name ?? event.club?.name}</Text>
                  )}
                </View>
                <View style={[s.eventBadge, { backgroundColor: bgColor }]}>
                  <Text style={[s.eventBadgeText, { color }]}>
                    {isReservation ? 'Reserva' : isMatch ? 'Partido' : 'Torneo'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  weekRow: {
    flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  dayBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  dayBtnActive: { backgroundColor: '#16a34a' },
  dayName: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  dayNameActive: { color: '#dcfce7' },
  dayNum: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  dayNumActive: { color: '#fff' },
  scroll: { padding: 16, paddingBottom: 32 },
  dateLabel: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 16, textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyText: { color: '#9ca3af', marginTop: 12, fontSize: 14 },
  eventCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  eventDot: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  eventInfo: { flex: 1 },
  eventTime: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 1 },
  eventSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  eventBadgeText: { fontSize: 11, fontWeight: '700' },
});
