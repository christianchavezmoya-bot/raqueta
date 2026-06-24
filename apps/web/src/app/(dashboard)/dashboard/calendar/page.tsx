'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import api from '@/lib/api';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 - 21:00

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  RESERVATION: { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-800' },
  MATCH: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800' },
  TOURNAMENT: { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-800' },
  CLASS: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-800' },
};

export default function CalendarPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [view, setView] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = weekDays[0];
  const to = addDays(weekDays[6], 1);

  const { data: events, isLoading } = useQuery({
    queryKey: ['calendar', selectedClub?.id, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data } = await api.get(
        `/calendar/club/${selectedClub?.id}?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const allEvents: any[] = [
    ...(events?.reservations ?? []).map((r: any) => ({ ...r, _type: 'RESERVATION' })),
    ...(events?.matches ?? []).map((m: any) => ({ ...m, _type: 'MATCH' })),
    ...(events?.classes ?? []).map((c: any) => ({ ...c, _type: 'CLASS' })),
  ];

  const getEventsForDayHour = (day: Date, hour: number) =>
    allEvents.filter(e => {
      const start = new Date(e.startTime ?? e.scheduledTime ?? e.startDate);
      return isSameDay(start, day) && start.getHours() === hour;
    });

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendario del Club</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm font-medium ${view === 'week' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setView('week')}
            >
              Semana
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium ${view === 'day' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setView('day')}
            >
              Día
            </button>
          </div>
        </div>
      </div>

      {/* Week navigation */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={goToday} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
              Hoy
            </button>
            <button onClick={nextWeek} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <span className="text-sm font-semibold text-gray-700 capitalize">
            {format(from, "MMMM yyyy", { locale: es })}
          </span>
          <div className="flex gap-3 text-xs">
            {Object.entries(EVENT_COLORS).map(([type, c]) => (
              <div key={type} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full border-2 ${c.border} ${c.bg}`} />
                <span className="text-gray-500">
                  {type === 'RESERVATION' ? 'Reserva' : type === 'MATCH' ? 'Partido' : type === 'TOURNAMENT' ? 'Torneo' : 'Clase'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-auto max-h-[600px]">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
              <div />
              {weekDays.map(day => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={`text-center py-2 border-b border-gray-100 cursor-pointer ${isToday ? 'text-brand-600' : 'text-gray-600'}`}
                    onClick={() => { setSelectedDay(day); setView('day'); }}
                  >
                    <p className="text-xs font-medium uppercase">{format(day, 'EEE', { locale: es })}</p>
                    <p className={`text-lg font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full ${isToday ? 'bg-brand-600 text-white' : ''}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Hour rows */}
            {HOURS.map(hour => (
              <div key={hour} className="grid border-b border-gray-50" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                <div className="text-right pr-2 pt-1 text-xs text-gray-400 font-medium">
                  {hour}:00
                </div>
                {weekDays.map(day => {
                  const dayEvents = getEventsForDayHour(day, hour);
                  return (
                    <div key={day.toISOString()} className="border-l border-gray-100 min-h-[48px] p-0.5 relative">
                      {dayEvents.map(event => {
                        const colors = EVENT_COLORS[event._type] ?? EVENT_COLORS.RESERVATION;
                        const title = event._type === 'RESERVATION'
                          ? event.court?.name ?? 'Reserva'
                          : event._type === 'MATCH'
                          ? 'Partido'
                          : event.title ?? 'Clase';
                        return (
                          <div
                            key={event.id}
                            className={`text-xs px-1.5 py-0.5 rounded border-l-2 mb-0.5 truncate ${colors.bg} ${colors.border} ${colors.text} font-medium`}
                          >
                            {format(new Date(event.startTime ?? event.scheduledTime ?? event.startDate), 'HH:mm')} {title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <CalendarDays className="w-8 h-8 animate-pulse" />
          </div>
        )}

        {!isLoading && !selectedClub && (
          <div className="text-center py-12 text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecciona un club para ver el calendario</p>
          </div>
        )}
      </div>
    </div>
  );
}
