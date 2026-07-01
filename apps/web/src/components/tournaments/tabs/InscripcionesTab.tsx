'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PhoneOff, Smartphone, Trophy, Users } from 'lucide-react';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { classifyRoster, hasAppAccount, type RosterLike } from '../player-type';
import { rosterDisplayName, teamDisplayName } from '../display-name';

type Filter = 'ALL' | 'SOCIO' | 'CASUAL' | 'EXTERNO';

interface Props {
  categories: any[];
}

export default function InscripcionesTab({ categories }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');

  const allRegistrations = useMemo(() => {
    const out: Array<{
      id: string;
      categoryId: string;
      categoryName: string;
      roster?: RosterLike | null;
      team?: { id?: string; player1Roster?: RosterLike | null; player2Roster?: RosterLike | null } | null;
      registeredAt?: string;
      paymentStatus?: string;
      type: 'SOCIO' | 'CASUAL' | 'EXTERNO' | 'SIN_VINCULAR';
      hasApp: boolean;
      display: string;
    }> = [];
    for (const cat of categories ?? []) {
      for (const reg of cat.registrations ?? []) {
        const type = reg.team
          ? classifyRoster(reg.team.player1Roster).type === 'EXTERNO' ||
            classifyRoster(reg.team.player2Roster).type === 'EXTERNO'
            ? 'EXTERNO'
            : classifyRoster(reg.team.player1Roster).type
          : classifyRoster(reg.roster).type;
        const hasApp = reg.team
          ? hasAppAccount(reg.team.player1Roster) && hasAppAccount(reg.team.player2Roster)
          : hasAppAccount(reg.roster);
        const display = reg.team
          ? teamDisplayName(reg.team)
          : rosterDisplayName(reg.roster);
        out.push({
          id: reg.id,
          categoryId: cat.id,
          categoryName: cat.name,
          roster: reg.roster,
          team: reg.team,
          registeredAt: reg.registeredAt,
          paymentStatus: reg.paymentStatus,
          type,
          hasApp,
          display,
        });
      }
    }
    return out;
  }, [categories]);

  const filtered = filter === 'ALL' ? allRegistrations : allRegistrations.filter(r => r.type === filter);

  const counts = useMemo(() => {
    const c = { SOCIO: 0, CASUAL: 0, EXTERNO: 0, SIN_VINCULAR: 0 };
    for (const r of allRegistrations) c[r.type] += 1;
    return c;
  }, [allRegistrations]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'SOCIO', 'CASUAL', 'EXTERNO'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'ALL' ? `Todos (${allRegistrations.length})` : `${labelFor(f)} (${counts[f]})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Mostrando <span className="font-semibold text-gray-700">{filtered.length}</span> de {allRegistrations.length}
        </p>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay inscripciones que coincidan con el filtro</p>
        </div>
      )}

      {/* Category sections */}
      {categories?.map((cat: any) => {
        const inCategory = filtered.filter(r => r.categoryId === cat.id);
        if (inCategory.length === 0) return null;
        return (
          <div key={cat.id} className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="font-semibold text-gray-900">{cat.name}</span>
              <span className="badge-gray text-xs">{inCategory.length}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">App</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Fecha inscripción</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inCategory.map(reg => (
                  <tr key={reg.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-gray-900">{reg.display}</p>
                    </td>
                    <td className="px-5 py-2.5">
                      {reg.team ? (
                        <div className="flex flex-col gap-1">
                          <PlayerTypeBadge roster={reg.team.player1Roster} />
                          <PlayerTypeBadge roster={reg.team.player2Roster} />
                        </div>
                      ) : (
                        <PlayerTypeBadge roster={reg.roster} />
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {reg.hasApp ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <Smartphone className="w-3.5 h-3.5" /> Con app
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <PhoneOff className="w-3.5 h-3.5" /> Sin app
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-gray-600">
                      {reg.registeredAt
                        ? format(new Date(reg.registeredAt), 'd MMM yyyy', { locale: es })
                        : '—'}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={reg.paymentStatus === 'PAID' ? 'badge-green' : 'badge-yellow'}>
                        {reg.paymentStatus === 'PAID' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function labelFor(f: Filter): string {
  if (f === 'SOCIO') return 'Socios';
  if (f === 'CASUAL') return 'Casuals';
  if (f === 'EXTERNO') return 'Externos';
  return 'Todos';
}