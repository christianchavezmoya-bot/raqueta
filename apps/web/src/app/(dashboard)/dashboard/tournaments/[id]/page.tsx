'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  Play,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';
import { useAuthStore } from '@/stores/auth.store';

import ResumenTab from '@/components/tournaments/tabs/ResumenTab';
import InscripcionesTab from '@/components/tournaments/tabs/InscripcionesTab';
import CuadroTab from '@/components/tournaments/tabs/CuadroTab';
import PartidosTab from '@/components/tournaments/tabs/PartidosTab';
import RankingTab from '@/components/tournaments/tabs/RankingTab';
import LigaTab from '@/components/tournaments/tabs/LigaTab';
import DesafiosTab from '@/components/tournaments/tabs/DesafiosTab';
import ComunicarTab from '@/components/tournaments/tabs/ComunicarTab';

type TabKey = 'resumen' | 'inscripciones' | 'cuadro' | 'partidos' | 'ranking' | 'liga' | 'desafios' | 'comunicar';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'badge-gray' },
  REGISTRATION_OPEN: { label: 'Inscripción abierta', color: 'badge-green' },
  REGISTRATION_CLOSED: { label: 'Inscripción cerrada', color: 'badge-yellow' },
  IN_PROGRESS: { label: 'En curso', color: 'badge-yellow' },
  COMPLETED: { label: 'Finalizado', color: 'badge-gray' },
  CANCELLED: { label: 'Cancelado', color: 'badge-red' },
};

export default function TournamentDetailPage() {
  return (
    <Suspense fallback={<div className="card h-48 animate-pulse bg-gray-100" />}>
      <TournamentDetailInner />
    </Suspense>
  );
}

function TournamentDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const selectedClub = useClubStore(s => s.selectedClub);
  const user = useAuthStore(s => s.user);

  // ── Deep linking via ?tab= ─────────────────────────────────────────────
  const validTabs: TabKey[] = ['resumen', 'inscripciones', 'cuadro', 'partidos', 'ranking', 'liga', 'desafios', 'comunicar'];
  const rawTab = searchParams.get('tab');
  const initialTab: TabKey = (validTabs.includes(rawTab as TabKey) ? rawTab : 'resumen') as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [showAdvancedTabs, setShowAdvancedTabs] = useState(true);

  // Keep the URL in sync when the tab changes via the nav.
  useEffect(() => {
    if (rawTab !== activeTab) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', activeTab);
      router.replace(`/dashboard/tournaments/${id}?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, id, rawTab, router, searchParams]);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/tournaments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });

  const canManage = ['SUPER_ADMIN', 'CLUB_ADMIN', 'MANAGER', 'RECEPTION'].includes(user?.role ?? '');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="card h-48 animate-pulse bg-gray-100" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Torneo no encontrado</p>
        <button className="btn-secondary mt-4" onClick={() => router.back()}>Volver</button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[tournament.status] ?? { label: tournament.status, color: 'badge-gray' };
  const totalRegistrations = tournament.categories?.reduce(
    (sum: number, cat: any) => sum + (cat.registrations?.length ?? 0), 0,
  ) ?? 0;

  const allRegistrations = (tournament.categories ?? []).flatMap((cat: any) => cat.registrations ?? []);

  // Liga tab is only visible when the tournament format is round-robin.
  const showLiga = tournament.format === 'ROUND_ROBIN';
  const visibleTabs: TabKey[] = ['resumen', 'inscripciones', 'cuadro', 'partidos', 'ranking'];
  if (showLiga) visibleTabs.push('liga');
  visibleTabs.push('desafios', 'comunicar');

  const tabLabels: Record<TabKey, string> = {
    resumen: 'Resumen',
    inscripciones: 'Inscripciones',
    cuadro: 'Cuadro',
    partidos: 'Partidos',
    ranking: 'Ranking',
    liga: 'Liga',
    desafios: 'Desafíos',
    comunicar: 'Comunicar',
  };

  const tabIcons: Record<TabKey, any> = {
    resumen: Layers,
    inscripciones: Users,
    cuadro: Trophy,
    partidos: Calendar,
    ranking: BarChart3,
    liga: Trophy,
    desafios: Swords,
    comunicar: Bell,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
            <span className={statusCfg.color}>{statusCfg.label}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(tournament.startDate), 'd MMM', { locale: es })} {' '}
            – {format(new Date(tournament.endDate), 'd MMM yyyy', { locale: es })}
          </p>
        </div>

        {/* Status actions */}
        {canManage && (
          <div className="flex gap-2">
            {tournament.status === 'DRAFT' && (
              <button className="btn-primary" onClick={() => updateStatusMutation.mutate('REGISTRATION_OPEN')}>
                Abrir inscripciones
              </button>
            )}
            {tournament.status === 'REGISTRATION_OPEN' && (
              <button
                className="btn-secondary"
                onClick={() => updateStatusMutation.mutate('REGISTRATION_CLOSED')}
              >
                Cerrar inscripciones
              </button>
            )}
            {tournament.status === 'IN_PROGRESS' && (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => updateStatusMutation.mutate('COMPLETED')}
              >
                <CheckCircle className="w-4 h-4" /> Finalizar torneo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-x-1">
          {visibleTabs.map(tab => {
            const Icon = tabIcons[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === tab
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tabLabels[tab]}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active tab */}
      {activeTab === 'resumen' && (
        <ResumenTab
          tournament={tournament}
          allRegistrations={allRegistrations}
          matches={tournament.matches ?? []}
        />
      )}
      {activeTab === 'inscripciones' && (
        <InscripcionesTab categories={tournament.categories ?? []} />
      )}
      {activeTab === 'cuadro' && (
        <CuadroTab
          tournamentId={id}
          tournamentFormat={tournament.format}
          tournamentStatus={tournament.status}
          canManage={canManage}
        />
      )}
      {activeTab === 'partidos' && (
        <PartidosTab
          tournamentId={id}
          matches={tournament.matches ?? []}
          canManage={canManage}
        />
      )}
      {activeTab === 'ranking' && <RankingTab clubId={selectedClub?.id} />}
      {activeTab === 'liga' && <LigaTab clubId={selectedClub?.id} />}
      {activeTab === 'desafios' && <DesafiosTab clubId={selectedClub?.id} />}
      {activeTab === 'comunicar' && (
        <ComunicarTab
          tournamentId={id}
          tournamentName={tournament.name}
          tournamentStatus={tournament.status}
          registrations={allRegistrations}
        />
      )}
    </div>
  );
}