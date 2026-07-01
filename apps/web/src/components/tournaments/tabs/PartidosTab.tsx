'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Play, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { rosterDisplayName, teamDisplayName } from '../display-name';
import type { RosterLike } from '../player-type';

interface MatchLite {
  id: string;
  status: string;
  scheduledTime?: string | null;
  playerOneScore?: string | null;
  playerTwoScore?: string | null;
  playerOneId?: string | null;
  playerTwoId?: string | null;
  playerOneRoster?: RosterLike | null;
  playerTwoRoster?: RosterLike | null;
  teamOne?: { id?: string; player1Roster?: RosterLike | null; player2Roster?: RosterLike | null } | null;
  teamTwo?: { id?: string; player1Roster?: RosterLike | null; player2Roster?: RosterLike | null } | null;
  category?: { id?: string; name?: string } | null;
}

const MATCH_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Programado', cls: 'badge-gray' },
  IN_PROGRESS: { label: 'En curso', cls: 'badge-yellow' },
  COMPLETED: { label: 'Completado', cls: 'badge-green' },
  CANCELLED: { label: 'Cancelado', cls: 'badge-red' },
  WALKOVER: { label: 'Walkover', cls: 'badge-yellow' },
};

export default function PartidosTab({ tournamentId, matches, canManage }: { tournamentId: string; matches: MatchLite[]; canManage: boolean }) {
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<'result' | 'wo' | null>(null);

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Play className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No hay partidos generados. Genera el fixture primero.</p>
      </div>
    );
  }

  // Group by category for readability (if categories are present)
  const byCategory = new Map<string, { name: string; matches: MatchLite[] }>();
  for (const m of matches) {
    const id = m.category?.id ?? '__none__';
    const name = m.category?.name ?? 'Sin categoría';
    if (!byCategory.has(id)) byCategory.set(id, { name, matches: [] });
    byCategory.get(id)!.matches.push(m);
  }

  return (
    <div className="space-y-6">
      {Array.from(byCategory.entries()).map(([catId, { name, matches: catMatches }]) => (
        <div key={catId}>
          {byCategory.size > 1 && (
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{name}</h3>
          )}
          <div className="space-y-2">
            {catMatches.map(match => (
              <MatchRow
                key={match.id}
                match={match}
                canManage={canManage}
                isOpen={openMatchId === match.id}
                openMode={openMode}
                onOpen={(mode) => {
                  setOpenMatchId(match.id);
                  setOpenMode(mode);
                }}
                onClose={() => {
                  setOpenMatchId(null);
                  setOpenMode(null);
                }}
                tournamentId={tournamentId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchRow({
  match,
  canManage,
  isOpen,
  openMode,
  onOpen,
  onClose,
  tournamentId,
}: {
  match: MatchLite;
  canManage: boolean;
  isOpen: boolean;
  openMode: 'result' | 'wo' | null;
  onOpen: (mode: 'result' | 'wo') => void;
  onClose: () => void;
  tournamentId: string;
}) {
  const queryClient = useQueryClient();
  const selectedClub = useClubStore(s => s.selectedClub);
  const status = MATCH_STATUS_LABELS[match.status] ?? { label: match.status, cls: 'badge-gray' };

  const isDoubles = !!(match.teamOne || match.teamTwo);
  const leftName = isDoubles
    ? teamDisplayName(match.teamOne as any)
    : rosterDisplayName(match.playerOneRoster as any);
  const rightName = isDoubles
    ? teamDisplayName(match.teamTwo as any)
    : rosterDisplayName(match.playerTwoRoster as any);

  const now = Date.now();
  const overdue =
    match.status === 'SCHEDULED' &&
    match.scheduledTime &&
    now - new Date(match.scheduledTime).getTime() > 1000 * 60 * 60 * 48;

  const hasResult = match.playerOneScore || match.playerTwoScore;

  const bothPlayersReady = isDoubles
    ? !!(match.teamOne?.id && match.teamTwo?.id)
    : !!(match.playerOneRoster?.id && match.playerTwoRoster?.id);

  return (
    <div
      className={`card ${overdue ? 'border-l-4 border-l-red-500' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="text-center min-w-[140px]">
            <p className="font-semibold text-gray-900 truncate">{leftName}</p>
            {isDoubles && match.teamOne && (
              <div className="flex flex-col items-center gap-0.5 mt-1">
                <PlayerTypeBadge roster={match.teamOne.player1Roster} />
                <PlayerTypeBadge roster={match.teamOne.player2Roster} />
              </div>
            )}
            {!isDoubles && (
              <div className="mt-1">
                <PlayerTypeBadge roster={match.playerOneRoster} />
              </div>
            )}
          </div>
          <span className="text-gray-400 font-bold">vs</span>
          <div className="text-center min-w-[140px]">
            <p className="font-semibold text-gray-900 truncate">{rightName}</p>
            {isDoubles && match.teamTwo && (
              <div className="flex flex-col items-center gap-0.5 mt-1">
                <PlayerTypeBadge roster={match.teamTwo.player1Roster} />
                <PlayerTypeBadge roster={match.teamTwo.player2Roster} />
              </div>
            )}
            {!isDoubles && (
              <div className="mt-1">
                <PlayerTypeBadge roster={match.playerTwoRoster} />
              </div>
            )}
          </div>
          {hasResult && (
            <span className="text-sm font-mono font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
              {[match.playerOneScore, match.playerTwoScore].filter(Boolean).join(' ')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {overdue && (
            <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
              Atrasado
            </span>
          )}
          {match.scheduledTime && (
            <span className="text-xs text-gray-500 hidden md:inline">
              {format(new Date(match.scheduledTime), 'd MMM HH:mm', { locale: es })}
            </span>
          )}
          <span className={status.cls}>{status.label}</span>
          {canManage && match.status === 'SCHEDULED' && bothPlayersReady && (
            <>
              <button
                className="btn-primary text-xs py-1 px-3"
                onClick={() => onOpen('result')}
              >
                Registrar resultado
              </button>
              <button
                className="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                onClick={() => onOpen('wo')}
                title="Registrar WO o retiro por lesión"
              >
                <ShieldOff className="w-3 h-3" /> WO / Retiro
              </button>
            </>
          )}
        </div>
      </div>

      {isOpen && openMode === 'result' && (
        <ResultEntryForm
          match={match}
          onClose={onClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
            queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'bracket'] });
            onClose();
          }}
        />
      )}
      {isOpen && openMode === 'wo' && (
        <WoRetiroForm
          match={match}
          tournamentId={tournamentId}
          selectedClub={selectedClub}
          onClose={onClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
            queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'bracket'] });
            onClose();
          }}
        />
      )}
    </div>
  );
}

function ResultEntryForm({
  match,
  onClose,
  onSuccess,
}: {
  match: MatchLite;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [winnerSide, setWinnerSide] = useState<'ONE' | 'TWO' | ''>('');
  const [score, setScore] = useState('');

  const submit = useMutation({
    mutationFn: () => {
      const [p1 = '', p2 = ''] = score.trim().split(/\s+/, 2);
      const isDoubles = !!(match.teamOne || match.teamTwo);
      const winnerRosterId = !isDoubles
        ? (winnerSide === 'ONE' ? match.playerOneRoster?.id : match.playerTwoRoster?.id)
        : undefined;
      const winnerTeamId = isDoubles
        ? (winnerSide === 'ONE' ? match.teamOne?.id : match.teamTwo?.id)
        : undefined;
      return api.post(`/matches/${match.id}/result`, {
        winnerRosterId,
        winnerTeamId,
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

  const leftName = match.teamOne
    ? teamDisplayName(match.teamOne as any)
    : rosterDisplayName(match.playerOneRoster as any);
  const rightName = match.teamTwo
    ? teamDisplayName(match.teamTwo as any)
    : rosterDisplayName(match.playerTwoRoster as any);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <WinnerOption label={leftName} type="ONE" selected={winnerSide} onSelect={setWinnerSide} />
        <WinnerOption label={rightName} type="TWO" selected={winnerSide} onSelect={setWinnerSide} />
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

function WinnerOption({
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

// ─── WO / Retiro form ──────────────────────────────────────────────────────

function WoRetiroForm({
  match,
  tournamentId: _tournamentId,
  selectedClub,
  onClose,
  onSuccess,
}: {
  match: MatchLite;
  tournamentId: string;
  selectedClub: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [retiredSide, setRetiredSide] = useState<'ONE' | 'TWO' | ''>('');

  const submit = useMutation({
    mutationFn: async () => {
      if (!retiredSide) throw new Error('Selecciona el jugador que se retiró');
      const isDoubles = !!(match.teamOne || match.teamTwo);

      // The non-retired side wins.
      const winnerSide: 'ONE' | 'TWO' = retiredSide === 'ONE' ? 'TWO' : 'ONE';

      // 1. Record the match result via the tournament match endpoint.
      const winnerRosterId = !isDoubles
        ? (winnerSide === 'ONE' ? match.playerOneRoster?.id : match.playerTwoRoster?.id)
        : undefined;
      const winnerTeamId = isDoubles
        ? (winnerSide === 'ONE' ? match.teamOne?.id : match.teamTwo?.id)
        : undefined;

      await api.post(`/matches/${match.id}/result`, {
        winnerRosterId,
        winnerTeamId,
        playerOneScore: 'WO',
        playerTwoScore: 'WO',
      });

      // 2. Create a ClubMatchResult with RETIRO_LESION category so the
      //    internal ranking reflects the walkover injury.
      const loserRosterId = !isDoubles
        ? (retiredSide === 'ONE' ? match.playerOneRoster?.id : match.playerTwoRoster?.id)
        : (retiredSide === 'ONE' ? match.teamOne?.player1Roster?.id : match.teamTwo?.player1Roster?.id);
      const winnerRosterForClub = !isDoubles
        ? (winnerSide === 'ONE' ? match.playerOneRoster?.id : match.playerTwoRoster?.id)
        : (winnerSide === 'ONE' ? match.teamOne?.player1Roster?.id : match.teamTwo?.player1Roster?.id);

      if (selectedClub?.id && loserRosterId && winnerRosterForClub) {
        try {
          await api.post(`/clubs/${selectedClub.id}/match-results`, {
            categoryKey: 'RETIRO_LESION',
            winnerRosterId: winnerRosterForClub,
            loserRosterId,
            matchDate: new Date().toISOString(),
            notes: `WO/Retiro registrado desde torneo ${_tournamentId} partido ${match.id}`,
          });
        } catch (e) {
          // Non-fatal — the tournament match was recorded; the internal
          // ranking entry is best-effort.
          console.warn('Could not record RETIRO_LESION club result', e);
        }
      }
    },
    onSuccess: () => {
      toast.success('WO/Retiro registrado');
      onSuccess();
    },
    onError: () => toast.error('Error al registrar el retiro'),
  });

  const leftName = match.teamOne
    ? teamDisplayName(match.teamOne as any)
    : rosterDisplayName(match.playerOneRoster as any);
  const rightName = match.teamTwo
    ? teamDisplayName(match.teamTwo as any)
    : rosterDisplayName(match.playerTwoRoster as any);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <p className="text-sm text-gray-700">
        Selecciona el jugador que se retiró. El ganador se asignará automáticamente.
        También se creará un resultado <span className="badge-yellow text-xs">RETIRO_LESION</span> en el ranking interno.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRetiredSide('ONE')}
          className={`text-left rounded-lg border px-3 py-2 transition-colors ${
            retiredSide === 'ONE'
              ? 'border-red-500 bg-red-50 ring-1 ring-red-200'
              : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-xs uppercase text-red-600 font-bold">Se retiró</p>
          <p className="text-sm font-medium text-gray-900">{leftName}</p>
        </button>
        <button
          type="button"
          onClick={() => setRetiredSide('TWO')}
          className={`text-left rounded-lg border px-3 py-2 transition-colors ${
            retiredSide === 'TWO'
              ? 'border-red-500 bg-red-50 ring-1 ring-red-200'
              : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-xs uppercase text-red-600 font-bold">Se retiró</p>
          <p className="text-sm font-medium text-gray-900">{rightName}</p>
        </button>
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          onClick={() => submit.mutate()}
          disabled={!retiredSide || submit.isPending}
        >
          {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar WO/Retiro'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}