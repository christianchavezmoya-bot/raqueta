import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  format, addDays, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, isSameMonth, isSameDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';

const BG = '#0a0f1a'; const CARD = '#111827'; const GOLD = '#d4a017';
const GREEN = '#22c55e'; const TEXT = '#f9fafb'; const SUB = '#9ca3af';
const BORDER = '#1f2937';

const DAY_HEADERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export default function CalendarScreen() {
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

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

  /* All events fetched for the month (for dot indicators) */
  const { data: monthCalendar } = useQuery({
    queryKey: ['calendar-month', format(viewMonth, 'yyyy-MM')],
    queryFn: async () => {
      const from = startOfMonth(viewMonth);
      const to = endOfMonth(viewMonth);
      const { data } = await api.get(`/calendar/user?from=${from.toISOString()}&to=${to.toISOString()}`);
      return data;
    },
  });

  const allMonthEvents = [
    ...(monthCalendar?.reservations ?? []),
    ...(monthCalendar?.matches ?? []),
    ...(monthCalendar?.tournaments ?? []),
  ];

  const datesWithEvents = new Set(
    allMonthEvents.map((e: any) => {
      const d = e.startTime ?? e.scheduledTime ?? e.startDate;
      return d ? new Date(d).toDateString() : null;
    }).filter(Boolean),
  );

  const allEvents = [
    ...(calendar?.reservations ?? []),
    ...(calendar?.matches ?? []),
    ...(calendar?.tournaments ?? []),
  ].sort((a, b) => new Date(a.startTime ?? a.startDate ?? a.scheduledTime).getTime()
    - new Date(b.startTime ?? b.startDate ?? b.scheduledTime).getTime());

  /* Build month grid */
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: addDays(monthEnd, (6 - monthEnd.getDay() + 7) % 7) });

  const prevMonth = () => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() - 1);
    setViewMonth(d);
  };
  const nextMonth = () => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + 1);
    setViewMonth(d);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Calendario</Text>
        <View style={s.headerMeta}>
          <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
            <Ionicons name="chevron-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>
            {format(viewMonth, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={TEXT} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Day-of-week headers */}
      <View style={s.dayHeaders}>
        {DAY_HEADERS.map(d => (
          <Text key={d} style={s.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Month grid */}
      <View style={s.grid}>
        {gridDays.map(day => {
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);
          const inMonth = isSameMonth(day, viewMonth);
          const hasEvent = datesWithEvents.has(day.toDateString());

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[s.dayCell, isSelected && s.dayCellSelected, isToday && !isSelected && s.dayCellToday]}
              onPress={() => { setSelectedDate(day); if (!isSameMonth(day, viewMonth)) setViewMonth(day); }}
              activeOpacity={0.7}
            >
              <Text style={[
                s.dayNum,
                !inMonth && s.dayNumFaded,
                isSelected && s.dayNumSelected,
                isToday && !isSelected && s.dayNumToday,
              ]}>
                {format(day, 'd')}
              </Text>
              {hasEvent && inMonth && (
                <View style={[s.eventDot, isSelected && { backgroundColor: '#0a0f1a' }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Agenda del día */}
      <View style={s.agendaHeader}>
        <Text style={s.agendaTitle}>Agenda del día</Text>
        <Text style={s.agendaDate}>
          {format(selectedDate, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, c => c.toUpperCase())}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 32 }} />
        ) : allEvents.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={40} color={SUB} />
            <Text style={s.emptyText}>Sin eventos para este día</Text>
          </View>
        ) : (
          allEvents.map((event: any, i) => {
            const isReservation = event.type === 'RESERVATION';
            const isMatch = event.type === 'MATCH';
            const color = isReservation ? GREEN : isMatch ? GOLD : '#7c3aed';
            const time = event.startTime
              ? format(new Date(event.startTime), 'HH:mm')
              : event.scheduledTime
              ? format(new Date(event.scheduledTime), 'HH:mm')
              : format(new Date(event.startDate), 'dd/MM');

            return (
              <View key={event.id + i} style={s.eventCard}>
                {/* Time block */}
                <View style={s.timeBlock}>
                  <Text style={s.eventTime}>{time}</Text>
                </View>
                {/* Colored bar */}
                <View style={[s.colorBar, { backgroundColor: color }]} />
                {/* Info */}
                <View style={s.eventInfo}>
                  <Text style={s.eventTitle}>
                    {isReservation
                      ? event.court?.name ?? 'Reserva'
                      : isMatch
                      ? 'Partido'
                      : event.name}
                  </Text>
                  <Text style={s.eventSub}>
                    {isReservation
                      ? event.club?.profile?.name ?? event.club?.name ?? ''
                      : isMatch
                      ? event.opponent ?? ''
                      : event.category ?? ''}
                  </Text>
                </View>
                {/* Type badge */}
                <View style={[s.typeBadge, { borderColor: color + '55' }]}>
                  <Text style={[s.typeBadgeText, { color }]}>
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
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: TEXT, marginBottom: 12 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
  navBtn: { padding: 6 },

  dayHeaders: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: SUB },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 8 },
  dayCell: {
    width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6,
    borderRadius: 10, gap: 3,
  },
  dayCellSelected: { backgroundColor: GOLD },
  dayCellToday: { borderWidth: 1, borderColor: GOLD },
  dayNum: { fontSize: 14, fontWeight: '600', color: TEXT },
  dayNumFaded: { color: '#374151' },
  dayNumSelected: { color: '#0a0f1a', fontWeight: '800' },
  dayNumToday: { color: GOLD, fontWeight: '800' },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD },

  agendaHeader: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  agendaTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  agendaDate: { fontSize: 13, color: SUB, marginTop: 2, textTransform: 'capitalize' },

  scroll: { padding: 16, paddingBottom: 40, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 32, gap: 12 },
  emptyText: { color: SUB, fontSize: 14 },

  eventCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  timeBlock: { minWidth: 44, alignItems: 'center' },
  eventTime: { fontSize: 14, fontWeight: '800', color: TEXT },
  colorBar: { width: 3, height: 40, borderRadius: 2 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  eventSub: { fontSize: 12, color: SUB, marginTop: 3 },
  typeBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
});
