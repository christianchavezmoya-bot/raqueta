'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Medal, RefreshCcw, Settings2, Trophy, Upload } from 'lucide-react';
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

export default function RankingsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [manual, setManual] = useState({ winnerPlayerId: '', loserPlayerId: '', winnerNameRaw: '', loserNameRaw: '', categoryKey: '', recordedAt: new Date().toISOString().slice(0, 16) });
  const [rulesDraft, setRulesDraft] = useState<RuleDraft[]>([]);
  const [uploadSummary, setUploadSummary] = useState<any>(null);

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

  const refreshQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['internal-rankings', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['ranking-rules', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['rankings', selectedClub?.id] });
  };

  const saveRules = useMutation({
    mutationFn: () => api.put(`/clubs/${selectedClub?.id}/ranking-rules`, { rules: rulesDraft }),
    onSuccess: () => refreshQueries(),
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
    },
  });

  const recalculate = useMutation({
    mutationFn: () => api.post(`/clubs/${selectedClub?.id}/rankings/recalculate`),
    onSuccess: () => refreshQueries(),
  });

  const filtered = category ? rankings?.filter((r: any) => r.category === category) : rankings;
  const categories = [...new Set(rankings?.map((r: any) => r.category) ?? [])];

  const handleUpload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(`/clubs/${selectedClub?.id}/match-results/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setUploadSummary(data);
    refreshQueries();
  };

  const updateRule = (index: number, field: keyof RuleDraft, value: string | number | boolean) => {
    setRulesDraft(current => current.map((rule, idx) => idx === index ? { ...rule, [field]: value } : rule));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ranking</h1>
          <p className="text-sm text-gray-500">Torneo existente + ranking interno del club separados.</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => recalculate.mutate()} disabled={recalculate.isPending || !selectedClub?.id}>
          <RefreshCcw className="w-4 h-4" />
          {recalculate.isPending ? 'Recalculando...' : 'Recalcular ranking interno'}
        </button>
      </div>

      <section className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-900">Ranking de torneos</h2>
            <p className="text-xs text-gray-500">Ruta existente, sin mezclar con el ranking interno del club.</p>
          </div>
          <select className="input-field w-auto" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Todas las categor?as</option>
            {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-12">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categor?a</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 4 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
                  ))
                : filtered?.map((r: any, idx: number) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{idx < 3 ? <Medal className="w-4 h-4 text-amber-500" /> : idx + 1}</td>
                      <td className="px-4 py-3">{r.player?.playerProfile?.displayName ?? r.player?.email}</td>
                      <td className="px-4 py-3">{r.category}</td>
                      <td className="px-4 py-3 font-semibold">{r.points}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Reglas del ranking interno</h2>
              <p className="text-xs text-gray-500">Los puntos se recalculan desde resultados crudos, no se congelan por partido.</p>
            </div>
          </div>

          <div className="space-y-3">
            {rulesDraft.map((rule, index) => (
              <div key={rule.categoryKey} className="grid gap-3 rounded-xl border border-gray-100 p-4 md:grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_auto]">
                <input className="input-field" value={rule.categoryKey} onChange={e => updateRule(index, 'categoryKey', e.target.value.toUpperCase())} />
                <input className="input-field" value={rule.label} onChange={e => updateRule(index, 'label', e.target.value)} />
                <input className="input-field" type="number" value={rule.winnerPoints} onChange={e => updateRule(index, 'winnerPoints', Number(e.target.value))} />
                <input className="input-field" type="number" value={rule.loserPoints} onChange={e => updateRule(index, 'loserPoints', Number(e.target.value))} />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={rule.active} onChange={e => updateRule(index, 'active', e.target.checked)} />
                  Activa
                </label>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setRulesDraft(current => [...current, { categoryKey: '', label: '', winnerPoints: 0, loserPoints: 0, active: true }])}>Agregar categor?a</button>
            <button className="btn-primary" onClick={() => saveRules.mutate()} disabled={saveRules.isPending}>{saveRules.isPending ? 'Guardando...' : 'Guardar reglas'}</button>
          </div>
        </section>

        <section className="card space-y-5">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Ingresar resultados</h2>
              <p className="text-xs text-gray-500">Carga archivo CSV/XLSX o agrega un partido manualmente.</p>
            </div>
          </div>

          <label className="block rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500 cursor-pointer hover:border-brand-400">
            Subir CSV/XLSX
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e => { const file = e.target.files?.[0]; if (file) void handleUpload(file); }} />
          </label>

          {uploadSummary && (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 space-y-1">
              <p><span className="font-semibold text-gray-900">Filas procesadas:</span> {uploadSummary.processedRows}</p>
              <p><span className="font-semibold text-gray-900">Jugadores vinculados:</span> {uploadSummary.matchedPlayers}</p>
              <p><span className="font-semibold text-gray-900">Sin match:</span> {(uploadSummary.unmatchedPlayers ?? []).join(', ') || 'Ninguno'}</p>
              <p><span className="font-semibold text-gray-900">Filas inv?lidas:</span> {(uploadSummary.invalidRows ?? []).map((row: any) => `fila ${row.rowNumber}: ${row.reason}`).join(' | ') || 'Ninguna'}</p>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900">Resultado manual</h3>
            <select className="input-field" value={manual.winnerPlayerId} onChange={e => {
              const player = clubPlayers.find((item: any) => item.id === e.target.value);
              setManual(current => ({ ...current, winnerPlayerId: e.target.value, winnerNameRaw: player?.displayName ?? '' }));
            }}>
              <option value="">Ganador</option>
              {clubPlayers.map((player: any) => <option key={player.id} value={player.id}>{player.displayName}</option>)}
            </select>
            <select className="input-field" value={manual.loserPlayerId} onChange={e => {
              const player = clubPlayers.find((item: any) => item.id === e.target.value);
              setManual(current => ({ ...current, loserPlayerId: e.target.value, loserNameRaw: player?.displayName ?? '' }));
            }}>
              <option value="">Perdedor</option>
              {clubPlayers.map((player: any) => <option key={player.id} value={player.id}>{player.displayName}</option>)}
            </select>
            <select className="input-field" value={manual.categoryKey} onChange={e => setManual(current => ({ ...current, categoryKey: e.target.value }))}>
              <option value="">Categor?a</option>
              {rulesDraft.map(rule => <option key={rule.categoryKey} value={rule.categoryKey}>{rule.label || rule.categoryKey}</option>)}
            </select>
            <input className="input-field" type="datetime-local" value={manual.recordedAt} onChange={e => setManual(current => ({ ...current, recordedAt: e.target.value }))} />
            <button className="btn-primary w-full" onClick={() => addManualResult.mutate()} disabled={addManualResult.isPending}>{addManualResult.isPending ? 'Guardando...' : 'Registrar partido'}</button>
          </div>
        </section>
      </div>

      <section className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <BarChart3 className="w-5 h-5 text-brand-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Ranking interno del club</h2>
            <p className="text-xs text-gray-500">Calculado desde `ClubMatchResult` + reglas activas del club.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rank</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Partidos</th>
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
            <p className="text-sm">Sin ranking interno todav?a</p>
          </div>
        )}
      </section>
    </div>
  );
}
