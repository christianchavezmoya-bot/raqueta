'use client';

import { useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, Share2, Trophy, UserCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function PublicPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['player-public-profile', id],
    queryFn: async () => {
      const { data } = await api.get(`/players/${id}/public`);
      return data;
    },
    enabled: !!id,
  });

  const exportCard = async (mode: 'download' | 'share') => {
    if (!cardRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(cardRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const dataUrl = canvas.toDataURL('image/png');

    if (mode === 'share' && navigator.share) {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `ngo-player-${id}.png`, { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: data?.playerProfile?.displayName ?? 'Estadísticas del jugador' });
        return;
      } catch {
        toast.error('No se pudo abrir el selector para compartir');
        return;
      }
    }

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `ngo-player-${id}.png`;
    anchor.click();
  };

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-gray-500">Cargando perfil...</div>;
  }

  if (!data?.playerProfile) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-gray-500">Jugador no encontrado.</div>;
  }

  const profile = data.playerProfile;
  const statsCard = profile.statsCard;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7faf7_0%,#ffffff_45%,#f3f4f6_100%)]">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="rounded-[32px] border border-white/70 bg-white p-8 shadow-[0_20px_80px_rgba(17,24,39,0.08)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-green-50 text-green-700">
                <UserCircle2 className="h-10 w-10" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Perfil público</p>
                <h1 className="mt-2 text-3xl font-semibold text-gray-950">{profile.displayName}</h1>
                <p className="mt-1 text-sm text-gray-500">
                  {profile.level}
                  {profile.comuna ? ` · ${profile.comuna}` : ''}
                  {profile.homeClub?.name ? ` · ${profile.homeClub.name}` : ''}
                </p>
              </div>
            </div>

            {statsCard && (
              <div className="flex gap-2">
                <button type="button" onClick={() => exportCard('download')} className="btn-secondary">
                  <Download className="mr-2 h-4 w-4" />
                  PNG
                </button>
                <button type="button" onClick={() => exportCard('share')} className="btn-primary">
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartir
                </button>
              </div>
            )}
          </div>

          {profile.bio && <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">{profile.bio}</p>}

          <div ref={cardRef} className="mt-8 rounded-[28px] border border-gray-200 bg-gray-50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Stat card</p>
                <h2 className="text-xl font-semibold text-gray-900">Resumen competitivo</h2>
              </div>
            </div>

            {!statsCard ? (
              <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-8 text-sm text-gray-500">
                Este jugador mantiene sus estadísticas privadas para otros jugadores.
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Partidos', value: statsCard.summary.matchesPlayed },
                    { label: 'Victorias', value: statsCard.summary.wins },
                    { label: 'Derrotas', value: statsCard.summary.losses },
                    { label: 'Puntos', value: statsCard.summary.rankingPoints },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900">Rendimiento por fuente</p>
                    <div className="mt-3 space-y-2">
                      {statsCard.bySource.map((entry: any) => (
                        <div key={entry.source} className="flex items-center justify-between text-sm text-gray-600">
                          <span>{entry.source}</span>
                          <span>{entry.wins}W / {entry.losses}L</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900">Tendencia reciente</p>
                    <div className="mt-3 space-y-2">
                      {statsCard.recentTrend.map((entry: any) => (
                        <div key={`${entry.source}-${entry.month}`} className="flex items-center justify-between text-sm text-gray-600">
                          <span>{entry.month} · {entry.source}</span>
                          <span>{entry.wins}W / {entry.losses}L</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
