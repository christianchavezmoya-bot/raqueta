'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Gift, Medal, RefreshCcw, Settings2, Trophy, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useRankings } from '@/hooks/use-club';
import { api } from '@/lib/api';

type RuleDraft = {
  categoryKey: string;
  label: string;
  winnerPoints: number;
  loserPoints: number;
  active: boolean;
};

type AwardFormState = {
  rosterId: string;
  bonusTypeId: string;
  pointsOverride: string;
  note: string;
};

const EMPTY_AWARD_FORM: AwardFormState = {
  rosterId: '',
  bonusTypeId: '',
  pointsOverride: '',
  note: '',
};

export default function RankingsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [manual, setManual] = useState({
    winnerPlayerId: '',
    loserPlayerId: '',
    winnerNameRaw: '',
    loserNameRaw: '',
    categoryKey: '',
    recordedAt: new Date().toISOString().slice(0, 16),
  });
  const [rulesDraft, setRulesDraft] = useState<RuleDraft[]>([]);
  const [uploadSummary, setUploadSummary] = useState<any>(null);
  const [awardForm, setAwardForm] = useState<AwardFormState>(EMPTY_AWARD_FORM);

  const { data: rankings, isLoading } = useRankings(selectedClub?.id);
  const { data: internalRankings = [] } = useQuery({
    queryKey: ['internal-rankings', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/rankings/internal`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['ranking-rules', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/ranking-rules`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });
  const { data: clubPlayers = [] } = useQuery({
    queryKey: ['ranking-players', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/ranking-players`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });
  const { data: seasons = [] } = useQuery({
    queryKey: ['ranking-seasons', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/seasons`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedClub?.id,
  });
  const activeSeason = useMemo(
    () => seasons.find((season: any) => season.status === 'ACTIVE') ?? null,
    [seasons],
  );
  const { data: bonusTypes = [] } = useQuery({
    queryKey: ['bonus-types-staff', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/bonus-points/types`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedClub?.id,
  });
  const { data: bonusAwards = [] } = useQuery({
    queryKey: ['bonus-awards', selectedClub?.id, activeSeason?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/bonus-points`, {
        params: { seasonId: activeSeason?.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedClub?.id && !!activeSeason?.id,
  });

  const selectedBonusType = useMemo(
    () => bonusTypes.find((bonusType: any) => bonusType.id === awardForm.bonusTypeId) ?? null,
    [bonusTypes, awardForm.bonusTypeId],
  );
  const awardPointsPreview = awardForm.pointsOverride === ''
    ? selectedBonusType?.points ?? 0
    : Number(awardForm.pointsOverride);

  useEffect(() => {
    setRulesDraft(rules.map((rule: any) => ({
      categoryKey: rule.categoryKey,
      label: rule.label,
      winnerPoints: rule.winnerPoints,
      loserPoints: rule.loserPoints,
      active: rule.active,
    })));
    if (rules.length && !manual.categoryKey) {
      setManual(current => ({ ...current, categoryKey: rules[0].categoryKey }));
    }
  }, [rules]);

  useEffect(() => {
    if (!clubPlayers.length || awardForm.rosterId) return;
    setAwardForm(current => ({ ...current, rosterId: clubPlayers[0].id }));
  }, [clubPlayers, awardForm.rosterId]);

  useEffect(() => {
    if (!bonusTypes.length || awardForm.bonusTypeId) return;
    setAwardForm(current => ({ ...current, bonusTypeId: bonusTypes[0].id }));
  }, [bonusTypes, awardForm.bonusTypeId]);

  const refreshQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['internal-rankings', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['ranking-rules', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['rankings', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['bonus-types-staff', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['bonus-awards', selectedClub?.id] });
  };

  const saveRules = useMutation({
    mutationFn: () => api.put(`/clubs/${selectedClub?.id}/ranking-rules`, { rules: rulesDraft }),
    onSuccess: () => {
      refreshQueries();
      toast.success('Reglas guardadas');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudieron guardar las reglas'),
  });

  const addManualResult = useMutation({
    mutationFn: () => api.post(`/clubs/${selectedClub?.id}/match-results`, {
      ...manual,
      setScores: undefined,
      recordedAt: new Date(manual.recordedAt).toISOString(),
    }),
    onSuccess: () => {
      refreshQueries();
      setManual(current => ({ ...current, winnerPlayerId: '', loserPlayerId: '', winnerNameRaw: '', loserNameRaw: '' }));
      toast.success('Partido registrado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo registrar el partido'),
  });

  const recalculate = useMutation({
    mutationFn: () => api.post(`/clubs/${selectedClub?.id}/rankings/recalculate`),
    onSuccess: () => {
      refreshQueries();
      toast.success('Ranking recalculado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo recalcular'),
  });

  const awardBonus = useMutation({
    mutationFn: () => api.post(`/clubs/${selectedClub?.id}/bonus-points`, {
      seasonId: activeSeason?.id,
      rosterId: awardForm.rosterId,
      bonusTypeId: awardForm.bonusTypeId,
      pointsOverride: awardForm.pointsOverride === '' ? undefined : Number(awardForm.pointsOverride),
      note: awardForm.note.trim(),
    }),
    onSuccess: () => {
      refreshQueries();
      setAwardForm(current => ({
        ...EMPTY_AWARD_FORM,
        rosterId: current.rosterId,
        bonusTypeId: current.bonusTypeId,
      }));
      toast.success('Ajuste de puntos registrado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo registrar el ajuste'),
  });

  const filtered = category ? rankings?.filter((ranking: any) => ranking.category === category) : rankings;
  const categories = [...new Set(rankings?.map((ranking: any) => ranking.category) ?? [])];

  const handleUpload = async (file: File) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/clubs/${selectedClub?.id}/match-results/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSummary(data);
      refreshQueries();
      toast.success('Archivo procesado');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'No se pudo importar el archivo');
    }
  };

  const updateRule = (index: number, field: keyof RuleDraft, value: string | number | boolean) => {
    setRulesDraft(current => current.map((rule, idx) => idx === index ? { ...rule, [field]: value } : rule));
  };

  const submitAward = () => {
    if (!activeSeason?.id) {
      toast.error('No hay una temporada activa para registrar bonos o penalizaciones');
      return;
    }
    if (!awardForm.rosterId || !awardForm.bonusTypeId) {
      toast.error('Selecciona jugador y tipo base');
      return;
    }
    if (!awardForm.note.trim()) {
      toast.error('Agrega una nota explicando el ajuste');
      return;
    }
    if (awardForm.pointsOverride !== '' && Number.isNaN(Number(awardForm.pointsOverride))) {
      toast.error('El puntaje personalizado debe ser numérico');
      return;
    }
    awardBonus.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ranking</h1>
          <p className="text-sm text-gray-500">Torneo existente + ranking interno del club separados.</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => recalculate.mutate()} disabled={recalculate.isPending || !selectedClub?.id}>
          <RefreshCcw className="h-4 w-4" />
          {recalculate.isPending ? 'Recalculando...' : 'Recalcular ranking interno'}
        </button>
      </div>

      <section className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-900">Ranking de torneos</h2>
            <p className="text-xs text-gray-500">Ruta existente, sin mezclar con el ranking interno del club.</p>
          </div>
          <select className="input-field w-auto" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">Todas las categorias</option>
            {categories.map((value: any) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Jugador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: 4 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                      ))}
                    </tr>
                  ))
                : filtered?.map((ranking: any, index: number) => (
                    <tr key={ranking.id}>
                      <td className="px-4 py-3">{index < 3 ? <Medal className="h-4 w-4 text-amber-500" /> : index + 1}</td>
                      <td className="px-4 py-3">{ranking.player?.playerProfile?.displayName ?? ranking.player?.email}</td>
                      <td className="px-4 py-3">{ranking.category}</td>
                      <td className="px-4 py-3 font-semibold">{ranking.points}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Reglas del ranking interno</h2>
              <p className="text-xs text-gray-500">Los puntos se recalculan desde resultados crudos, no se congelan por partido.</p>
            </div>
          </div>

          <div className="space-y-3">
            {rulesDraft.map((rule, index) => (
              <div key={rule.categoryKey || index} className="grid gap-3 rounded-xl border border-gray-100 p-4 md:grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_auto]">
                <input className="input-field" value={rule.categoryKey} onChange={event => updateRule(index, 'categoryKey', event.target.value.toUpperCase())} />
                <input className="input-field" value={rule.label} onChange={event => updateRule(index, 'label', event.target.value)} />
                <input className="input-field" type="number" value={rule.winnerPoints} onChange={event => updateRule(index, 'winnerPoints', Number(event.target.value))} />
                <input className="input-field" type="number" value={rule.loserPoints} onChange={event => updateRule(index, 'loserPoints', Number(event.target.value))} />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={rule.active} onChange={event => updateRule(index, 'active', event.target.checked)} />
                  Activa
                </label>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setRulesDraft(current => [...current, { categoryKey: '', label: '', winnerPoints: 0, loserPoints: 0, active: true }])}>Agregar categoria</button>
            <button className="btn-primary" onClick={() => saveRules.mutate()} disabled={saveRules.isPending}>{saveRules.isPending ? 'Guardando...' : 'Guardar reglas'}</button>
          </div>
        </section>

        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Ingresar resultados</h2>
              <p className="text-xs text-gray-500">Carga archivo CSV/XLSX o agrega un partido manualmente.</p>
            </div>
          </div>

          <label className="block cursor-pointer rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500 hover:border-brand-400">
            Subir CSV/XLSX
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={event => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }} />
          </label>

          {uploadSummary && (
            <div className="space-y-1 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <p><span className="font-semibold text-gray-900">Filas procesadas:</span> {uploadSummary.processedRows}</p>
              <p><span className="font-semibold text-gray-900">Jugadores vinculados:</span> {uploadSummary.matchedPlayers}</p>
              <p><span className="font-semibold text-gray-900">Sin match:</span> {(uploadSummary.unmatchedPlayers ?? []).join(', ') || 'Ninguno'}</p>
              <p><span className="font-semibold text-gray-900">Filas invalidas:</span> {(uploadSummary.invalidRows ?? []).map((row: any) => `fila ${row.rowNumber}: ${row.reason}`).join(' | ') || 'Ninguna'}</p>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900">Resultado manual</h3>
            <select className="input-field" value={manual.winnerPlayerId} onChange={event => {
              const player = clubPlayers.find((item: any) => item.id === event.target.value);
              setManual(current => ({ ...current, winnerPlayerId: event.target.value, winnerNameRaw: player?.displayName ?? player?.fullName ?? '' }));
            }}>
              <option value="">Ganador</option>
              {clubPlayers.map((player: any) => <option key={player.id} value={player.id}>{player.displayName ?? player.fullName}</option>)}
            </select>
            <select className="input-field" value={manual.loserPlayerId} onChange={event => {
              const player = clubPlayers.find((item: any) => item.id === event.target.value);
              setManual(current => ({ ...current, loserPlayerId: event.target.value, loserNameRaw: player?.displayName ?? player?.fullName ?? '' }));
            }}>
              <option value="">Perdedor</option>
              {clubPlayers.map((player: any) => <option key={player.id} value={player.id}>{player.displayName ?? player.fullName}</option>)}
            </select>
            <select className="input-field" value={manual.categoryKey} onChange={event => setManual(current => ({ ...current, categoryKey: event.target.value }))}>
              <option value="">Categoria</option>
              {rulesDraft.map(rule => <option key={rule.categoryKey} value={rule.categoryKey}>{rule.label || rule.categoryKey}</option>)}
            </select>
            <input className="input-field" type="datetime-local" value={manual.recordedAt} onChange={event => setManual(current => ({ ...current, recordedAt: event.target.value }))} />
            <button className="btn-primary w-full" onClick={() => addManualResult.mutate()} disabled={addManualResult.isPending}>{addManualResult.isPending ? 'Guardando...' : 'Registrar partido'}</button>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Bonos y penalizaciones manuales</h2>
              <p className="text-xs text-gray-500">Premios o castigos one-off reutilizando el endpoint existente con puntaje y nota libres.</p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Temporada activa</p>
            <p>{activeSeason ? `${activeSeason.name} (${activeSeason.status})` : 'No hay temporada activa'}</p>
            <p className="mt-2 text-xs text-amber-800">Puedes seleccionar un tipo base del ranking y sobrescribir el puntaje con cualquier valor positivo o negativo para ajustes ad-hoc.</p>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 p-4">
            <select data-testid="bonus-roster-select" className="input-field" value={awardForm.rosterId} onChange={event => setAwardForm(current => ({ ...current, rosterId: event.target.value }))}>
              <option value="">Jugador del roster</option>
              {clubPlayers.map((player: any) => (
                <option key={player.id} value={player.id}>
                  {(player.displayName ?? player.fullName) + (player.division ? ` · ${player.division}` : '')}
                </option>
              ))}
            </select>

            <select data-testid="bonus-type-select" className="input-field" value={awardForm.bonusTypeId} onChange={event => setAwardForm(current => ({ ...current, bonusTypeId: event.target.value }))}>
              <option value="">Tipo base</option>
              {bonusTypes.map((bonusType: any) => (
                <option key={bonusType.id} value={bonusType.id}>
                  {bonusType.label} ({bonusType.points >= 0 ? `+${bonusType.points}` : bonusType.points})
                </option>
              ))}
            </select>

            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Puntaje personalizado</span>
              <input
                className="input-field"
                type="number"
                data-testid="bonus-points-override"
                value={awardForm.pointsOverride}
                onChange={event => setAwardForm(current => ({ ...current, pointsOverride: event.target.value }))}
                placeholder={selectedBonusType ? String(selectedBonusType.points) : 'Ej. 15 o -12'}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nota / descripcion</span>
              <textarea
                className="input-field min-h-28"
                data-testid="bonus-note-input"
                value={awardForm.note}
                onChange={event => setAwardForm(current => ({ ...current, note: event.target.value }))}
                placeholder="Explica por que se entrega este bono o penalizacion"
              />
            </label>

            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
              <p><span className="font-semibold text-gray-900">Puntaje a aplicar:</span> {awardPointsPreview >= 0 ? `+${awardPointsPreview}` : awardPointsPreview}</p>
              <p><span className="font-semibold text-gray-900">Modo:</span> {awardPointsPreview >= 0 ? 'Bono' : 'Penalizacion'}</p>
            </div>

            <button data-testid="bonus-submit-button" className="btn-primary w-full" onClick={submitAward} disabled={awardBonus.isPending || !selectedClub?.id || !activeSeason?.id}>
              {awardBonus.isPending ? 'Registrando...' : 'Registrar ajuste manual'}
            </button>
          </div>
        </section>

        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Historial visible de bonos y penalizaciones</h2>
              <p className="text-xs text-gray-500">La nota queda visible aqui para auditoria del staff.</p>
            </div>
          </div>

          {bonusAwards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-400">
              Aun no hay bonos o penalizaciones registrados para la temporada activa.
            </div>
          ) : (
            <div className="space-y-3">
              {bonusAwards.map((award: any) => (
                <div key={award.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {award.rosterEntry?.firstName} {award.rosterEntry?.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{award.bonusType?.label} · {new Date(award.awardedAt).toLocaleString('es-CL')}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${award.points >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {award.points >= 0 ? `+${award.points}` : award.points}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{award.note || 'Sin nota'}</p>
                  <p className="mt-2 text-xs text-gray-400">Registrado por {award.awardedByUser?.email ?? 'staff'}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <BarChart3 className="h-5 w-5 text-brand-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Ranking interno del club</h2>
            <p className="text-xs text-gray-500">Calculado desde `ClubMatchResult` + reglas activas del club + bonos/penalizaciones por temporada.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Jugador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Puntos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Partidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {internalRankings.map((entry: any) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-semibold">{entry.rank}</td>
                  <td className="px-4 py-3">{entry.player?.displayName} <span className="text-xs text-gray-400">{entry.player?.user?.email}</span></td>
                  <td className="px-4 py-3">{entry.totalPoints}</td>
                  <td className="px-4 py-3">{entry.gamesPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!internalRankings.length && (
          <div className="py-12 text-center text-gray-400">
            <Trophy className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Sin ranking interno todavia</p>
          </div>
        )}
      </section>
    </div>
  );
}
