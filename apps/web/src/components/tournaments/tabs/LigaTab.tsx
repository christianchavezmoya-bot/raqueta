'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { rosterDisplayName } from '../display-name';
import type { RosterLike } from '../player-type';

interface Standing {
  position: number;
  rosterId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  zone: 'PROMOTION' | 'RELEGATION' | null;
}

interface LigaFixture {
  id: string;
  playerOneName: string;
  playerTwoName: string;
  playerOneRosterId?: string | null;
  playerTwoRosterId?: string | null;
  scheduledTime?: string | null;
  court?: string | null;
  status: 'PENDING' | 'COMPLETED';
  round?: string | null;
  setScores?: any;
  winnerRosterId?: string | null;
}

interface LigaPayload {
  active: boolean;
  tournament?: {
    id: string;
    name: string;
    currentRound?: string | null;
  };
  standings?: Standing[];
  fixtures?: LigaFixture[];
  nextMatch?: any;
}

interface Props {
  clubId?: string;
}

export default function LigaTab({ clubId }: Props) {
  const [subtab, setSubtab] = useState<'standings' | 'fixtures'>('standings');

  const { data, isLoading } = useQuery({
    queryKey: ['liga-promocion', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/liga-promocion`);
      return data as LigaPayload;
    },
    enabled: !!clubId,
  });

  if (isLoading) {
    return <div className="card h-48 animate-pulse bg-gray-100" />;
  }

  if (!data?.active) {
    return (
      <div className="card text-center py-12">
        <Play className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">No hay Liga Promoción activa</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Esta sección se activa automáticamente cuando un torneo ROUND_ROBIN (Todos contra todos)
          está en curso o con inscripciones abiertas en el club.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{data.tournament?.name}</h3>
          {data.tournament?.currentRound && (
            <p className="text-xs text-gray-500 mt-0.5">
              Ronda actual: <span className="font-medium">{data.tournament.currentRound}</span>
            </p>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setSubtab('standings')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              subtab === 'standings' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Tabla
          </button>
          <button
            onClick={() => setSubtab('fixtures')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              subtab === 'fixtures' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Partidos
          </button>
        </div>
      </div>

      {subtab === 'standings' && <StandingsTable standings={data.standings ?? []} />}
      {subtab === 'fixtures' && (
        <FixturesList
          fixtures={data.fixtures ?? []}
          clubId={clubId}
          tournamentId={data.tournament?.id}
        />
      )}
    </div>
  );
}

function StandingsTable({ standings }: { standings: Standing[] }) {
  if (standings.length === 0) {
    return <div className="card text-center text-gray-400 py-12">Aún no hay datos de tabla</div>;
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-12">#</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">PJ</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">G</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">P</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {standings.map(row => {
            const rowClass =
              row.zone === 'PROMOTION'
                ? 'bg-green-50/40'
                : row.zone === 'RELEGATION'
                  ? 'bg-red-50/40'
                  : '';
            return (
              <tr key={row.rosterId} className={rowClass}>
                <td className="px-3 py-2.5 text-center font-bold text-gray-700">{row.position}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{row.name}</span>
                    {row.zone === 'PROMOTION' && (
                      <span className="badge-green text-[10px]">Promoción</span>
                    )}
                    {row.zone === 'RELEGATION' && (
                      <span className="badge-red text-[10px]">Descenso</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center text-gray-700">{row.played}</td>
                <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.wins}</td>
                <td className="px-3 py-2.5 text-center text-red-700">{row.losses}</td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-900">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 ring-1 ring-green-200" /> Zona de promoción
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 ring-1 ring-red-200" /> Zona de descenso
        </span>
      </div>
    </div>
  );
}

function FixturesList({
  fixtures,
  clubId: _clubId,
  tournamentId: _tournamentId,
}: {
  fixtures: LigaFixture[];
  clubId?: string;
  tournamentId?: string;
}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const grouped = new Map<string, LigaFixture[]>();
  for (const f of fixtures) {
    const r = f.round ?? 'Sin ronda';
    if (!grouped.has(r)) grouped.set(r, []);
    grouped.get(r)!.push(f);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([round, items]) => (
        <div key={round} className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{round}</span>
          </div>
          <ul className="divide-y divide-gray-50">
            {items.map(f => {
              const completed = f.status === 'COMPLETED';
              const winnerSide: 'ONE' | 'TWO' | null = completed
                ? f.winnerRosterId === f.playerOneRosterId
                  ? 'ONE'
                  : f.winnerRosterId === f.playerTwoRosterId
                    ? 'TWO'
                    : null
                : null;
              const rosterA: RosterLike = { id: f.playerOneRosterId ?? 'a' };
              const rosterB: RosterLike = { id: f.playerTwoRosterId ?? 'b' };

              return (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`flex items-center gap-2 min-w-0 ${winnerSide === 'ONE' ? 'font-bold text-green-700' : ''}`}>
                        <span className="truncate">{f.playerOneName}</span>
                        <PlayerTypeBadge roster={rosterA} />
                      </div>
                      <span className="text-gray-400 text-xs">vs</span>
                      <div className={`flex items-center gap-2 min-w-0 ${winnerSide === 'TWO' ? 'font-bold text-green-700' : ''}`}>
                        <span className="truncate">{f.playerTwoName}</span>
                        <PlayerTypeBadge roster={rosterB} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {f.scheduledTime && (
                        <span className="text-xs text-gray-500 hidden md:inline">
                          {format(new Date(f.scheduledTime), 'd MMM HH:mm', { locale: es })}
                        </span>
                      )}
                      {f.court && <span className="badge-gray text-xs">{f.court}</span>}
                      <span className={completed ? 'badge-green' : 'badge-yellow'}>
                        {completed ? 'Completado' : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {!completed && openId !== f.id && (
                    <button
                      onClick={() => setOpenId(f.id)}
                      className="text-xs text-brand-600 hover:underline mt-1.5"
                    >
                      Registrar resultado
                    </button>
                  )}
                  {openId === f.id && (
                    <FixtureResultForm
                      fixture={f}
                      onClose={() => setOpenId(null)}
                      onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['liga-promocion', _clubId] });
                        setOpenId(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {fixtures.length === 0 && (
        <div className="card text-center text-gray-400 py-12">
          <p className="text-sm">Aún no hay partidos generados para esta liga</p>
        </div>
      )}
    </div>
  );
}

function FixtureResultForm({
  fixture,
  onClose,
  onSuccess,
}: {
  fixture: LigaFixture;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [winnerSide, setWinnerSide] = useState<'ONE' | 'TWO' | ''>('');
  const [score, setScore] = useState('');

  const submit = useMutation({
    mutationFn: () => {
      const [p1 = '', p2 = ''] = score.trim().split(/\s+/, 2);
      const winnerRosterId = winnerSide === 'ONE' ? fixture.playerOneRosterId : fixture.playerTwoRosterId;
      return api.post(`/matches/${fixture.id}/result`, {
        winnerRosterId,
        playerOneScore: p1,
        playerTwoScore: p2,
      });
    },
    onSuccess: () => {
      toast.success('Resultado registrado');
      onSuccess();
    },
    onError: () => toast.error('Error al registrar resultado'),
  });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <WinnerButton label={fixture.playerOneName} type="ONE" selected={winnerSide} onSelect={setWinnerSide} />
        <WinnerButton label={fixture.playerTwoName} type="TWO" selected={winnerSide} onSelect={setWinnerSide} />
      </div>
      <input
        className="input-field"
        placeholder="Marcador (ej: 6-4 7-5)"
        value={score}
        onChange={e => setScore(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          onClick={() => submit.mutate()}
          disabled={!winnerSide || submit.isPending}
        >
          {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

function WinnerButton({
  label,
  type,
  selected,
  onSelect,
}: {
  label: string;
  type: 'ONE' | 'TWO';
  selected: 'ONE' | 'TWO' | '';
  onSelect: (v: 'ONE' | 'TWO') => void;
}) {
  const active = selected === type;
  return (
    <button
      type="button"
      onClick={() => onSelect(type)}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        active
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{label}</p>
    </button>
  );
}