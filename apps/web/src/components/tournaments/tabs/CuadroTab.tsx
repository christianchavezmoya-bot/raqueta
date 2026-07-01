'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Loader2, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { classifyRoster, type RosterLike } from '../player-type';
import { rosterDisplayName, teamDisplayName } from '../display-name';

interface BracketPlayerSlot {
  name: string;
  type: 'PLAYER' | 'TEAM';
  rosterId?: string | null;
  teamId?: string | null;
  memberRosterIds: string[];
  roster?: RosterLike | null;
  memberRosters?: Array<RosterLike | null>;
}

interface BracketMatch {
  id: string;
  playerOne: BracketPlayerSlot;
  playerTwo: BracketPlayerSlot;
  winnerRosterId?: string | null;
  winnerTeamId?: string | null;
  winnerSide?: 'ONE' | 'TWO' | null;
  setScores?: any;
  status: 'COMPLETED' | 'PENDING';
  scheduledTime?: string | null;
}

interface BracketRound {
  round: string;
  label: string;
  bracketStage: string;
  matches: BracketMatch[];
}

interface BracketParticipant {
  type: 'PLAYER' | 'TEAM';
  name: string;
  rosterId?: string | null;
  teamId?: string | null;
  roster?: RosterLike | null;
  memberRosters?: Array<RosterLike | null>;
}

interface BracketPayload {
  tournamentId: string;
  format: string;
  rounds: BracketRound[];
  registrationOnly: boolean;
  participants: BracketParticipant[];
}

interface Props {
  tournamentId: string;
  tournamentFormat: string;
  tournamentStatus: string;
  /** Whether the logged-in user can manage the tournament (for inline result entry). */
  canManage: boolean;
}

export default function CuadroTab({ tournamentId, tournamentFormat, tournamentStatus, canManage }: Props) {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const { data: bracket, isLoading } = useQuery({
    queryKey: ['tournament', tournamentId, 'bracket'],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${tournamentId}/bracket`);
      return data as BracketPayload;
    },
    enabled: !!tournamentId,
  });

  const generateFixture = useMutation({
    mutationFn: () => api.post(`/tournaments/${tournamentId}/generate-fixture`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'bracket'] });
      toast.success('Fixture generado exitosamente');
    },
    onError: () => toast.error('Error al generar fixture'),
  });

  if (isLoading) {
    return (
      <div className="card h-48 animate-pulse bg-gray-100" />
    );
  }

  if (!bracket) {
    return <div className="card text-center text-gray-400">No se pudo cargar el cuadro</div>;
  }

  // Pre-registration state — show a seed list with the generate button.
  if (bracket.registrationOnly) {
    return (
      <SeedList
        participants={bracket.participants}
        tournamentStatus={tournamentStatus}
        canManage={canManage}
        isGenerating={generateFixture.isPending}
        onGenerate={() => generateFixture.mutate()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BracketHeader bracket={bracket} canManage={canManage} />
      <BracketGrid
        bracket={bracket}
        openMatchId={openMatchId}
        onToggle={setOpenMatchId}
        canManage={canManage}
        tournamentId={tournamentId}
        onRecorded={() => {
          queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'bracket'] });
          queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
          setOpenMatchId(null);
        }}
      />
    </div>
  );
}

// ─── Seed list (registration-only, no fixture yet) ─────────────────────────

function SeedList({
  participants,
  tournamentStatus,
  canManage,
  isGenerating,
  onGenerate,
}: {
  participants: BracketParticipant[];
  tournamentStatus: string;
  canManage: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Cuadro no generado</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {participants.length} participante{participants.length === 1 ? '' : 's'} inscripto{participants.length === 1 ? '' : 's'}
          </p>
        </div>
        {canManage && tournamentStatus === 'REGISTRATION_OPEN' && participants.length >= 2 && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generar fixture
          </button>
        )}
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Aún no hay inscripciones para generar el cuadro.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {participants.map((p, idx) => (
            <div key={p.teamId ?? p.rosterId ?? idx} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-gray-400 w-6">#{idx + 1}</span>
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                {p.type === 'TEAM' && p.memberRosters ? (
                  <>
                    <PlayerTypeBadge roster={p.memberRosters[0]} />
                    <PlayerTypeBadge roster={p.memberRosters[1]} />
                  </>
                ) : (
                  <PlayerTypeBadge roster={p.roster} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bracket header ───────────────────────────────────────────────────────

function BracketHeader({ bracket, canManage }: { bracket: BracketPayload; canManage: boolean }) {
  const total = bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0);
  const completed = bracket.rounds.reduce(
    (sum, r) => sum + r.matches.filter(m => m.status === 'COMPLETED').length,
    0,
  );

  return (
    <div className="flex items-center justify-between text-xs text-gray-500">
      <div className="flex gap-3">
        <span>
          <span className="font-semibold text-gray-700">{bracket.rounds.length}</span> ronda{bracket.rounds.length === 1 ? '' : 's'}
        </span>
        <span>
          <span className="font-semibold text-gray-700">{total}</span> partido{total === 1 ? '' : 's'}
        </span>
        <span>
          <span className="font-semibold text-green-700">{completed}</span> completado{completed === 1 ? '' : 's'}
        </span>
      </div>
      {canManage && (
        <span className="text-gray-400">
          Hacé click en un partido para registrar el resultado
        </span>
      )}
    </div>
  );
}

// ─── Bracket grid ─────────────────────────────────────────────────────────

function BracketGrid({
  bracket,
  openMatchId,
  onToggle,
  canManage,
  tournamentId,
  onRecorded,
}: {
  bracket: BracketPayload;
  openMatchId: string | null;
  onToggle: (id: string | null) => void;
  canManage: boolean;
  tournamentId: string;
  onRecorded: () => void;
}) {
  return (
    <div className="overflow-x-auto -mx-6 px-6 pb-4">
      <div className="flex gap-8 min-w-fit">
        {bracket.rounds.map((round, idx) => (
          <RoundColumn
            key={`${round.bracketStage}:${round.round}:${idx}`}
            round={round}
            roundIndex={idx}
            totalRounds={bracket.rounds.length}
            openMatchId={openMatchId}
            onToggle={onToggle}
            canManage={canManage}
            tournamentId={tournamentId}
            onRecorded={onRecorded}
          />
        ))}
      </div>
    </div>
  );
}

function RoundColumn({
  round,
  roundIndex,
  totalRounds,
  openMatchId,
  onToggle,
  canManage,
  tournamentId,
  onRecorded,
}: {
  round: BracketRound;
  roundIndex: number;
  totalRounds: number;
  openMatchId: string | null;
  onToggle: (id: string | null) => void;
  canManage: boolean;
  tournamentId: string;
  onRecorded: () => void;
}) {
  // Vertical spacing doubles each round to visually mimic a bracket tree.
  const baseGap = 12; // px between matches
  const slotHeight = 84; // match card height
  const verticalGap = Math.pow(2, roundIndex) * baseGap + Math.pow(2, roundIndex) * (slotHeight / 2) - slotHeight / 2;

  return (
    <div className="flex flex-col" style={{ minWidth: 260 }}>
      <div className="text-center mb-3 sticky left-0">
        <span className="badge-gray text-xs uppercase tracking-wide">{round.label}</span>
      </div>
      <div className="flex flex-col" style={{ gap: `${verticalGap}px` }}>
        {round.matches.map(match => (
          <MatchCard
            key={match.id}
            match={match}
            isOpen={openMatchId === match.id}
            onToggle={() => onToggle(openMatchId === match.id ? null : match.id)}
            canManage={canManage}
            tournamentId={tournamentId}
            onRecorded={onRecorded}
          />
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  isOpen,
  onToggle,
  canManage,
  tournamentId,
  onRecorded,
}: {
  match: BracketMatch;
  isOpen: boolean;
  onToggle: () => void;
  canManage: boolean;
  tournamentId: string;
  onRecorded: () => void;
}) {
  const interactive = canManage && match.playerOne.rosterId !== null && match.playerTwo.rosterId !== null
    && match.status === 'PENDING';
  const completed = match.status === 'COMPLETED';

  return (
    <div
      className={`relative rounded-xl bg-white shadow-sm ring-1 transition-shadow ${
        completed ? 'ring-green-200' : 'ring-gray-200'
      } ${interactive ? 'cursor-pointer hover:shadow-md' : ''}`}
      style={{ minHeight: 84 }}
      onClick={() => interactive && onToggle()}
    >
      <SideRow
        slot={match.playerOne}
        winnerSide={match.winnerSide}
        isWinner={match.winnerSide === 'ONE'}
        completed={completed}
      />
      <div className="h-px bg-gray-100 mx-3" />
      <SideRow
        slot={match.playerTwo}
        winnerSide={match.winnerSide}
        isWinner={match.winnerSide === 'TWO'}
        completed={completed}
      />

      {/* Connector lines for non-final rounds */}
      <BracketConnector roundIndex={0} />

      {isOpen && interactive && (
        <ResultEntryPanel
          match={match}
          tournamentId={tournamentId}
          onCancel={onToggle}
          onRecorded={onRecorded}
        />
      )}

      {/* Status footer */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {completed && <CheckCircle2 className="w-4 h-4 text-green-600" />}
        {!completed && interactive && (
          <span className="text-[10px] uppercase font-semibold text-brand-600 tracking-wide">Registrar</span>
        )}
        {!completed && !interactive && canManage && (
          <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Pendiente</span>
        )}
      </div>
    </div>
  );
}

/**
 * Decorative right-side connector that visually links each match to the
 * next round. Pure CSS, sits on the right edge of the card.
 */
function BracketConnector({ roundIndex: _ }: { roundIndex: number }) {
  return (
    <>
      <div className="absolute top-1/2 -right-3 w-3 h-px bg-gray-300" />
      <div className="absolute top-1/4 -right-3 w-3 h-px bg-gray-300" />
      <div className="absolute top-3/4 -right-3 w-3 h-px bg-gray-300" />
    </>
  );
}

function SideRow({
  slot,
  isWinner,
  completed,
}: {
  slot: BracketPlayerSlot;
  winnerSide?: 'ONE' | 'TWO' | null;
  isWinner: boolean;
  completed: boolean;
}) {
  const name = slot.type === 'TEAM' ? teamDisplayName(slot as any) : rosterDisplayName(slot.roster as any);
  const isPlaceholder = !name || name === 'TBD' || name === 'Jugador';

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${isWinner ? 'bg-green-50/60 rounded-t-xl' : ''}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isWinner && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
        <p className={`text-sm truncate ${isPlaceholder ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}`}>
          {name || (slot.type === 'TEAM' ? 'Pareja TBD' : 'Jugador TBD')}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {slot.type === 'TEAM' && slot.memberRosters ? (
          <div className="flex flex-col items-end gap-0.5">
            <PlayerTypeBadge roster={slot.memberRosters[0]} />
            <PlayerTypeBadge roster={slot.memberRosters[1]} />
          </div>
        ) : (
          <PlayerTypeBadge roster={slot.roster} />
        )}
      </div>
    </div>
  );
}

// ─── Inline result entry ───────────────────────────────────────────────────

function ResultEntryPanel({
  match,
  tournamentId: _tournamentId,
  onCancel,
  onRecorded,
}: {
  match: BracketMatch;
  tournamentId: string;
  onCancel: () => void;
  onRecorded: () => void;
}) {
  const queryClient = useQueryClient();
  const [winnerSide, setWinnerSide] = useState<'ONE' | 'TWO' | ''>('');
  const [score, setScore] = useState('');

  const submit = useMutation({
    mutationFn: () => {
      const [p1 = '', p2 = ''] = score.trim().split(/\s+/, 2);
      const winnerRosterId =
        winnerSide === 'ONE' ? match.playerOne.rosterId : winnerSide === 'TWO' ? match.playerTwo.rosterId : null;
      const winnerTeamId =
        winnerSide === 'ONE' ? match.playerOne.teamId : winnerSide === 'TWO' ? match.playerTwo.teamId : null;
      return api.post(`/matches/${match.id}/result`, {
        winnerRosterId,
        winnerTeamId,
        playerOneScore: p1,
        playerTwoScore: p2,
      });
    },
    onSuccess: () => {
      toast.success('Resultado registrado');
      onRecorded();
    },
    onError: () => toast.error('Error al registrar resultado'),
  });

  useEffect(() => {
    // Reset state when panel opens
    setWinnerSide('');
    setScore('');
  }, [match.id]);

  return (
    <div
      className="absolute left-0 right-0 top-full mt-2 z-10 rounded-xl bg-white shadow-lg ring-1 ring-gray-200 p-4"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-900 text-sm">Registrar resultado</p>
        <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="space-y-2">
        <WinnerOption
          label={rosterDisplayName(match.playerOne.roster as any)}
          type="ONE"
          selected={winnerSide}
          onSelect={setWinnerSide}
          sublabel={match.playerOne.type === 'TEAM' ? teamDisplayName(match.playerOne as any) : undefined}
        />
        <WinnerOption
          label={rosterDisplayName(match.playerTwo.roster as any)}
          type="TWO"
          selected={winnerSide}
          onSelect={setWinnerSide}
          sublabel={match.playerTwo.type === 'TEAM' ? teamDisplayName(match.playerTwo as any) : undefined}
        />
      </div>

      <input
        className="input-field mt-3"
        placeholder="Marcador (ej: 6-4 7-5)"
        value={score}
        onChange={e => setScore(e.target.value)}
      />

      <div className="flex gap-2 mt-3">
        <button
          className="btn-primary flex-1"
          disabled={!winnerSide || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function WinnerOption({
  label,
  type,
  selected,
  onSelect,
  sublabel,
}: {
  label: string;
  type: 'ONE' | 'TWO';
  selected: 'ONE' | 'TWO' | '';
  onSelect: (v: 'ONE' | 'TWO') => void;
  sublabel?: string;
}) {
  const active = selected === type;
  return (
    <button
      type="button"
      onClick={() => onSelect(type)}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        active
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{label}</p>
      {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
    </button>
  );
}