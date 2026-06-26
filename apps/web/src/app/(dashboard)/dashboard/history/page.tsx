'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarRange, FileClock, Filter, History, Search, UserRound } from 'lucide-react';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';

type TimelineItem = {
  id: string;
  occurredAt: string;
  type: 'COURT' | 'MATCH';
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
  playerNames: string[];
};

export default function HistoryPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [courtId, setCourtId] = useState('');
  const [competitionType, setCompetitionType] = useState('');
  const [division, setDivision] = useState('');
  const [category, setCategory] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState('');

  const { data: courts } = useQuery({
    queryKey: ['history', 'courts-list', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/courts`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: roster } = useQuery({
    queryKey: ['history', 'roster', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/roster`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: courtHistory, isLoading: isCourtsLoading } = useQuery({
    queryKey: ['history', 'court-events', selectedClub?.id, from, to, courtId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
      if (courtId) params.set('courtId', courtId);
      const { data } = await api.get(`/clubs/${selectedClub?.id}/history/courts?${params.toString()}`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: matchHistory, isLoading: isMatchesLoading } = useQuery({
    queryKey: ['history', 'match-events', selectedClub?.id, from, to, competitionType, division, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
      if (competitionType) params.set('competitionType', competitionType);
      if (division) params.set('division', division);
      if (category) params.set('category', category);
      const { data } = await api.get(`/clubs/${selectedClub?.id}/history/matches?${params.toString()}`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: playerHistory, isLoading: isPlayerHistoryLoading } = useQuery({
    queryKey: ['history', 'player', selectedClub?.id, selectedRosterId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/history/players/${selectedRosterId}`);
      return data;
    },
    enabled: !!selectedClub?.id && !!selectedRosterId,
  });

  const filteredRoster = useMemo(() => {
    const entries = roster ?? [];
    if (!playerSearch) return entries.slice(0, 8);
    return entries
      .filter((entry: any) => entry.fullName.toLowerCase().includes(playerSearch.toLowerCase()))
      .slice(0, 8);
  }, [playerSearch, roster]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const reservationItems = (courtHistory?.items ?? []).map((item: any) => ({
      id: `court-${item.id}`,
      occurredAt: item.startTime,
      type: 'COURT' as const,
      title: item.court.name,
      subtitle: item.player.displayName,
      detail: `${format(new Date(item.startTime), 'd MMM yyyy, HH:mm', { locale: es })} · ${item.outcome}`,
      badge: 'Cancha',
      playerNames: [item.player.displayName],
    }));

    const matchItems = (matchHistory?.items ?? []).map((item: any) => {
      const playerNames = [
        item.winner?.name,
        item.loser?.name,
        item.logOwner?.displayName,
        item.opponent?.displayName,
      ].filter(Boolean);
      const detailBits = [item.competitionType, item.category, item.division].filter(Boolean);

      return {
        id: `match-${item.competitionType}-${item.id}`,
        occurredAt: item.playedAt,
        type: 'MATCH' as const,
        title: item.summary,
        subtitle: item.tournament?.name ?? item.season?.label ?? 'Historial de partidos',
        detail: `${format(new Date(item.playedAt), 'd MMM yyyy, HH:mm', { locale: es })} · ${detailBits.join(' · ') || 'Sin categoría'}`,
        badge: 'Partido',
        playerNames,
      };
    });

    return [...reservationItems, ...matchItems]
      .filter(item =>
        !playerSearch ||
        item.playerNames.some(name => name.toLowerCase().includes(playerSearch.toLowerCase())),
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [courtHistory?.items, matchHistory?.items, playerSearch]);

  if (!selectedClub) {
    return (
      <div className="card text-center py-16 text-gray-400">
        <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Selecciona un club para ver el historial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">History</h1>
          <p className="text-sm text-gray-500">Reservas, resultados y trazabilidad del club en una sola vista.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <FileClock className="w-4 h-4" />
          {timeline.length} eventos
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Filter className="w-4 h-4 text-brand-600" />
          Filtros
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">Desde</span>
            <input className="input-field" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">Hasta</span>
            <input className="input-field" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">Cancha</span>
            <select className="input-field" value={courtId} onChange={e => setCourtId(e.target.value)}>
              <option value="">Todas</option>
              {(courts ?? []).map((court: any) => (
                <option key={court.id} value={court.id}>{court.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">Tipo de competencia</span>
            <select className="input-field" value={competitionType} onChange={e => setCompetitionType(e.target.value)}>
              <option value="">Todas</option>
              <option value="LADDER">Ranking interno</option>
              <option value="TOURNAMENT">Torneos</option>
              <option value="PERSONAL_LOG">Bitácora personal</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">División</span>
            <input className="input-field" value={division} onChange={e => setDivision(e.target.value)} placeholder="Ej. A" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-gray-500">Categoría</span>
            <input className="input-field" value={category} onChange={e => setCategory(e.target.value)} placeholder="Ej. STRAIGHT_SETS" />
          </label>
          <label className="space-y-1.5 text-sm md:col-span-2">
            <span className="text-gray-500">Buscar jugador</span>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input-field pl-9"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                placeholder="Nombre del jugador"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.75fr_1fr]">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-brand-600" />
              <h2 className="font-semibold text-gray-900">Timeline combinado</h2>
            </div>
            {(isCourtsLoading || isMatchesLoading) && <span className="text-xs text-gray-400">Cargando…</span>}
          </div>

          {!timeline.length ? (
            <div className="py-14 text-center text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No hay eventos para esos filtros.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {timeline.map(item => (
                <div key={item.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={item.type === 'COURT' ? 'badge-yellow' : 'badge-green'}>{item.badge}</span>
                        <p className="font-semibold text-gray-900">{item.title}</p>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{item.subtitle}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.detail}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {format(new Date(item.occurredAt), 'd MMM HH:mm', { locale: es })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <UserRound className="w-4 h-4 text-brand-600" />
              <h2 className="font-semibold text-gray-900">Búsqueda de jugador</h2>
            </div>
            <div className="space-y-2">
              {filteredRoster.length ? filteredRoster.map((entry: any) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedRosterId(entry.id)}
                  className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                    selectedRosterId === entry.id
                      ? 'border-brand-300 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-gray-900">{entry.fullName}</p>
                  <p className="text-xs text-gray-500">División {entry.division ?? '—'}</p>
                </button>
              )) : (
                <p className="text-sm text-gray-400">No hay jugadores que coincidan.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Historial del jugador</h2>
                <p className="text-xs text-gray-500">Vista resumida del roster seleccionado.</p>
              </div>
              {isPlayerHistoryLoading && <span className="text-xs text-gray-400">Cargando…</span>}
            </div>

            {!selectedRosterId ? (
              <p className="text-sm text-gray-400">Selecciona un jugador para ver su historial completo.</p>
            ) : !playerHistory ? (
              <p className="text-sm text-gray-400">Sin datos disponibles.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="font-semibold text-gray-900">{playerHistory.player.fullName}</p>
                  <p className="text-sm text-gray-500">División {playerHistory.player.division ?? '—'}</p>
                  <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                    <div>
                      <p className="text-gray-500">Partidos internos</p>
                      <p className="font-semibold text-gray-900">{playerHistory.counts.ladderMatches}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Reservas</p>
                      <p className="font-semibold text-gray-900">{playerHistory.counts.reservations}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Torneos</p>
                      <p className="font-semibold text-gray-900">{playerHistory.counts.tournamentMatches}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Bonos</p>
                      <p className="font-semibold text-gray-900">{playerHistory.counts.bonusAwards}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {(playerHistory.timeline ?? []).slice(0, 8).map((event: any) => (
                    <div key={`${event.kind}-${event.occurredAt}`} className="border-l-2 border-brand-200 pl-3">
                      <p className="text-sm font-medium text-gray-900">{event.summary}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(event.occurredAt), 'd MMM yyyy, HH:mm', { locale: es })} · {event.kind}
                      </p>
                    </div>
                  ))}
                </div>

                {playerHistory.player.linkedUserId && (
                  <Link
                    href={`/dashboard/players/${playerHistory.player.linkedUserId}`}
                    className="inline-flex text-sm font-medium text-brand-600 hover:underline"
                  >
                    Abrir perfil del jugador →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
