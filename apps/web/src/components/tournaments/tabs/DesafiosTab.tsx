'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Swords, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { rosterDisplayName } from '../display-name';
import type { RosterLike } from '../player-type';

interface ChallengeEntry {
  id: string;
  status: string;
  pointsAtStake: number;
  expiresAt: string;
  challengerName?: string;
  challengedName?: string;
  challengerRosterId?: string;
  challengedRosterId?: string;
  opponentName?: string;
  result?: 'WIN' | 'LOSS' | null;
  pointsDelta?: number | null;
  playedAt?: string;
}

interface ChallengesPayload {
  pointsAtStake: number;
  available: any[];
  pending: ChallengeEntry[];
  incoming: ChallengeEntry[];
  recent: ChallengeEntry[];
}

interface DesafioMatchResult {
  id: string;
  player1Name: string;
  player2Name: string;
  player1Id?: string;
  player2Id?: string;
  winnerId?: string;
  roundLabel: string;
  playedAt: string;
  pointsAwarded: number;
}

interface Props {
  clubId?: string;
}

export default function DesafiosTab({ clubId }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history' | 'standings'>('pending');
  const [openId, setOpenId] = useState<string | null>(null);

  // The /clubs/:clubId/challenges endpoint is roster-scoped — it returns
  // challenges where the current user is challenger or challenged. Staff
  // without a linked roster get an empty list; we surface that clearly.
  const {
    data: challenges,
    isLoading: loadingChallenges,
    error: challengesError,
  } = useQuery({
    queryKey: ['challenges', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/challenges`);
      return data as ChallengesPayload;
    },
    enabled: !!clubId,
    retry: false,
  });

  // DESAFIO match results are club-wide (visible to any club member with
  // /clubs/:clubId/match-results?source=DESAFIO). We use this for both the
  // history list and the leaderboard.
  const { data: desafioResults, isLoading: loadingResults } = useQuery({
    queryKey: ['match-results-desafio', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/match-results?source=DESAFIO&limit=50`);
      return data as DesafioMatchResult[];
    },
    enabled: !!clubId,
  });

  const allPending = [
    ...(challenges?.pending ?? []),
    ...(challenges?.incoming ?? []),
  ];

  const isStaffScoped = !!challengesError || (!loadingChallenges && (!challenges?.pending?.length && !challenges?.incoming?.length && !challenges?.recent?.length));

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Swords className="w-4 h-4 text-purple-600" /> Desafíos
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Puntos en juego: <span className="font-semibold">{challenges?.pointsAtStake ?? 0}</span>
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['pending', 'history', 'standings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'pending' ? 'Pendientes' : t === 'history' ? 'Historial' : 'Ranking'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pending' && (
        <PendingSection
          loading={loadingChallenges}
          challenges={allPending}
          staffView={isStaffScoped}
          openId={openId}
          setOpenId={setOpenId}
          clubId={clubId}
          onRecorded={() => {
            queryClient.invalidateQueries({ queryKey: ['challenges', clubId] });
            queryClient.invalidateQueries({ queryKey: ['match-results-desafio', clubId] });
            setOpenId(null);
          }}
        />
      )}

      {tab === 'history' && (
        <HistorySection
          loading={loadingResults}
          challenges={challenges?.recent ?? []}
          matchResults={desafioResults ?? []}
        />
      )}

      {tab === 'standings' && (
        <StandingsSection loading={loadingResults} matchResults={desafioResults ?? []} />
      )}
    </div>
  );
}

// ─── Pending ───────────────────────────────────────────────────────────────

function PendingSection({
  loading,
  challenges,
  staffView,
  openId,
  setOpenId,
  clubId,
  onRecorded,
}: {
  loading: boolean;
  challenges: ChallengeEntry[];
  staffView: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  clubId?: string;
  onRecorded: () => void;
}) {
  return (
    <div className="space-y-2">
      {staffView && !loading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <strong>Vista de staff:</strong> el endpoint de desafíos está scoped al roster del usuario
          actual. Si iniciaste sesión como staff sin roster vinculado, esta lista aparecerá vacía.
          Para ver los desafíos pendientes del club en su totalidad, consultá la base de datos o
          esperá a que un integrante del club con cuenta abra la app móvil.
        </div>
      )}

      {loading ? (
        <div className="card h-24 animate-pulse bg-gray-100" />
      ) : challenges.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <p className="text-sm">No hay desafíos pendientes</p>
        </div>
      ) : (
        challenges.map(c => (
          <ChallengeRow
            key={c.id}
            challenge={c}
            isOpen={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            clubId={clubId}
            onRecorded={onRecorded}
          />
        ))
      )}
    </div>
  );
}

function ChallengeRow({
  challenge,
  isOpen,
  onToggle,
  clubId,
  onRecorded,
}: {
  challenge: ChallengeEntry;
  isOpen: boolean;
  onToggle: () => void;
  clubId?: string;
  onRecorded: () => void;
}) {
  const submit = useMutation({
    mutationFn: (winnerRosterId: string) =>
      api.post(`/clubs/${clubId}/challenges/${challenge.id}/result`, { winnerRosterId }),
    onSuccess: () => {
      toast.success('Resultado del desafío registrado');
      onRecorded();
    },
    onError: () => toast.error('Error al registrar el resultado'),
  });

  const expired = new Date(challenge.expiresAt).getTime() < Date.now();

  return (
    <div className={`card ${expired ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Swords className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{challenge.challengerName}</span>
            <PlayerTypeBadge roster={{ id: challenge.challengerRosterId }} />
            <span className="text-gray-400 text-xs">desafía a</span>
            <span className="font-medium text-gray-900">{challenge.challengedName}</span>
            <PlayerTypeBadge roster={{ id: challenge.challengedRosterId }} />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="badge-yellow text-xs">{challenge.pointsAtStake} pts</span>
          <span className="text-xs text-gray-500 hidden md:inline">
            Expira {format(new Date(challenge.expiresAt), 'd MMM', { locale: es })}
          </span>
          {expired ? (
            <span className="badge-red text-xs">Expirado</span>
          ) : (
            <span className="badge-green text-xs">Pendiente</span>
          )}
          {!expired && (
            <button onClick={onToggle} className="btn-primary text-xs py-1 px-3">
              Registrar resultado
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-xs text-gray-500">Selecciona el ganador del desafío.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => submit.mutate(challenge.challengerRosterId!)}
              disabled={submit.isPending}
              className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-2 text-sm font-medium text-left"
            >
              Gana {challenge.challengerName}
            </button>
            <button
              type="button"
              onClick={() => submit.mutate(challenge.challengedRosterId!)}
              disabled={submit.isPending}
              className="rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-2 text-sm font-medium text-left"
            >
              Gana {challenge.challengedName}
            </button>
          </div>
          {submit.isPending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      )}
    </div>
  );
}

// ─── History ───────────────────────────────────────────────────────────────

function HistorySection({
  loading,
  challenges,
  matchResults,
}: {
  loading: boolean;
  challenges: ChallengeEntry[];
  matchResults: DesafioMatchResult[];
}) {
  // Merge the recent challenges (player-scoped) with the club-wide DESAFIO
  // match-results. When the actor has no linked roster the challenges list
  // is empty but match-results still surface.
  const combined = [
    ...challenges.map(c => ({
      id: c.id,
      label: c.opponentName ?? '—',
      playedAt: c.playedAt,
      status: c.status,
      result: c.result,
      points: c.pointsDelta,
      source: 'challenge' as const,
    })),
    ...matchResults.map(m => ({
      id: m.id,
      label: m.winnerId === m.player1Id ? m.player2Name : m.player1Name,
      playedAt: m.playedAt,
      status: 'COMPLETED',
      result: (m.winnerId === m.player1Id ? 'WIN' : 'LOSS') as 'WIN' | 'LOSS' | null,
      points: m.pointsAwarded,
      source: 'club-result' as const,
    })),
  ]
    .filter(c => !!c.playedAt)
    .sort((a, b) => new Date(b.playedAt!).getTime() - new Date(a.playedAt!).getTime())
    .slice(0, 20);

  if (loading) {
    return <div className="card h-24 animate-pulse bg-gray-100" />;
  }

  if (combined.length === 0) {
    return (
      <div className="card text-center text-gray-400 py-12">
        <p className="text-sm">No hay desafíos recientes</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Oponente</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Resultado</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {combined.map(c => (
            <tr key={c.id}>
              <td className="px-3 py-2.5 text-gray-600">
                {c.playedAt ? format(new Date(c.playedAt), 'd MMM yyyy', { locale: es }) : '—'}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">{c.label}</td>
              <td className="px-3 py-2.5 text-center">
                {c.result === 'WIN' && <span className="badge-green text-xs">Victoria</span>}
                {c.result === 'LOSS' && <span className="badge-red text-xs">Derrota</span>}
                {!c.result && <span className="badge-gray text-xs">{c.status}</span>}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-700">
                {c.points ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Standings ─────────────────────────────────────────────────────────────

function StandingsSection({ loading, matchResults }: { loading: boolean; matchResults: DesafioMatchResult[] }) {
  const standings = new Map<string, { name: string; wins: number; losses: number; points: number }>();
  for (const m of matchResults) {
    if (!m.winnerId) continue;
    const winnerName = m.winnerId === m.player1Id ? m.player1Name : m.player2Name;
    const loserName = m.winnerId === m.player1Id ? m.player2Name : m.player1Name;

    if (!standings.has(winnerName)) {
      standings.set(winnerName, { name: winnerName, wins: 0, losses: 0, points: 0 });
    }
    if (!standings.has(loserName)) {
      standings.set(loserName, { name: loserName, wins: 0, losses: 0, points: 0 });
    }
    standings.get(winnerName)!.wins += 1;
    standings.get(winnerName)!.points += m.pointsAwarded;
    standings.get(loserName)!.losses += 1;
  }

  const rows = Array.from(standings.values())
    .sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name));

  if (loading) {
    return <div className="card h-24 animate-pulse bg-gray-100" />;
  }

  if (rows.length === 0) {
    return (
      <div className="card text-center text-gray-400 py-12">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Aún no hay desafíos registrados</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-12">#</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">G</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">P</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, idx) => (
            <tr key={r.name}>
              <td className="px-3 py-2.5 text-center font-bold text-gray-700">{idx + 1}</td>
              <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
              <td className="px-3 py-2.5 text-center text-green-700 font-medium">{r.wins}</td>
              <td className="px-3 py-2.5 text-center text-red-700">{r.losses}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-900">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}