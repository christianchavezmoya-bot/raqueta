'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Info, Trophy, Users } from 'lucide-react';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { classifyRoster, type RosterLike } from '../player-type';

interface RegistrationLite {
  id: string;
  roster?: RosterLike | null;
  team?: { player1Roster?: RosterLike | null; player2Roster?: RosterLike | null } | null;
}

interface MatchLite {
  id: string;
  status: string;
  scheduledTime?: string | null;
}

interface Props {
  tournament: any;
  /** All registrations across all categories — used for the badge counters. */
  allRegistrations: RegistrationLite[];
  matches: MatchLite[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  REGISTRATION_OPEN: 'Inscripción abierta',
  REGISTRATION_CLOSED: 'Inscripción cerrada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export default function ResumenTab({ tournament, allRegistrations, matches }: Props) {
  // Bucket registrations by classification. For team-keyed registrations
  // both members are counted independently (matches what staff sees in the
  // inscriptions tab).
  const counts = { SOCIO: 0, CASUAL: 0, EXTERNO: 0, SIN_VINCULAR: 0, total: 0 };
  for (const reg of allRegistrations) {
    counts.total += 1;
    if (reg.team) {
      const a = classifyRoster(reg.team.player1Roster);
      const b = classifyRoster(reg.team.player2Roster);
      counts[a.type] += 1;
      counts[b.type] += 1;
    } else {
      const c = classifyRoster(reg.roster);
      counts[c.type] += 1;
    }
  }

  const now = Date.now();
  const overdue = matches.filter(m => {
    if (m.status !== 'SCHEDULED') return false;
    if (!m.scheduledTime) return false;
    const ts = new Date(m.scheduledTime).getTime();
    return now - ts > 1000 * 60 * 60 * 48;
  });

  const externos = allRegistrations.filter(r => {
    if (r.team) {
      return (
        classifyRoster(r.team.player1Roster).type === 'EXTERNO' ||
        classifyRoster(r.team.player2Roster).type === 'EXTERNO'
      );
    }
    return classifyRoster(r.roster).type === 'EXTERNO';
  });

  return (
    <div className="space-y-6">
      {/* Classification quick-stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Inscriptos totales</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-green-700">{counts.SOCIO}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <PlayerTypeBadge roster={hasMembership()} showHint={false} /> Socios
          </p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-yellow-700">{counts.CASUAL}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <PlayerTypeBadge roster={linkedOnly()} showHint={false} /> Casuals
          </p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-blue-700">{counts.EXTERNO}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <PlayerTypeBadge roster={externoSample()} showHint={false} /> Externos
          </p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-gray-700">{counts.SIN_VINCULAR}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <PlayerTypeBadge roster={null} showHint={false} /> Sin vincular
          </p>
        </div>
      </div>

      {/* Overdue results banner */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900">
              {overdue.length} partido{overdue.length === 1 ? '' : 's'} con resultado pendiente
            </p>
            <p className="text-xs text-yellow-800 mt-1">
              Programados hace más de 48 horas sin resultado registrado. Revisa la pestaña
              <span className="font-semibold"> Partidos </span> para actualizarlos.
            </p>
          </div>
        </div>
      )}

      {/* Externos warning */}
      {externos.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">
              {externos.length} jugador{externos.length === 1 ? '' : 'es'} sin app
            </p>
            <p className="text-xs text-blue-800 mt-1">
              Estos jugadores no recibirán notificaciones push. Usa la pestaña
              <span className="font-semibold"> Comunicar </span> para ver la lista manual.
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3">Información general</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Estado</dt>
              <dd className="font-medium">{STATUS_LABELS[tournament.status] ?? tournament.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Formato</dt>
              <dd className="font-medium">{tournament.format}</dd>
            </div>
            {tournament.description && (
              <div>
                <dt className="text-gray-500 mb-1">Descripción</dt>
                <dd className="text-gray-700">{tournament.description}</dd>
              </div>
            )}
            {tournament.registrationOpenDate && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Apertura inscripción</dt>
                <dd className="font-medium">{format(new Date(tournament.registrationOpenDate), 'd MMM yyyy', { locale: es })}</dd>
              </div>
            )}
            {tournament.registrationCloseDate && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Cierre inscripción</dt>
                <dd className="font-medium">{format(new Date(tournament.registrationCloseDate), 'd MMM yyyy', { locale: es })}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Categorías
          </h3>
          <div className="space-y-2">
            {(tournament.categories ?? []).map((cat: any) => (
              <div key={cat.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-sm text-gray-900">{cat.name}</p>
                  <p className="text-xs text-gray-500">
                    {cat.gender === 'MALE' ? 'Masculino' : cat.gender === 'FEMALE' ? 'Femenino' : 'Mixto'}
                    {cat.ageMin || cat.ageMax ? ` · ${cat.ageMin ?? ''}-${cat.ageMax ?? ''}` : ''}
                  </p>
                </div>
                <span className="badge-gray text-xs flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {cat.registrations?.length ?? 0}
                </span>
              </div>
            ))}
            {(!tournament.categories || tournament.categories.length === 0) && (
              <p className="text-sm text-gray-400">Sin categorías</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helpers to produce sample roster objects for the classification legend so
// each quick-stat card can show its own colored pill.
function hasMembership(): RosterLike {
  return { linkedPlayerProfileId: 'x', memberships: [{ status: 'ACTIVE' }] };
}
function linkedOnly(): RosterLike {
  return { linkedPlayerProfileId: 'x', memberships: [] };
}
function externoSample(): RosterLike {
  return { linkedPlayerProfileId: null, memberships: [] };
}