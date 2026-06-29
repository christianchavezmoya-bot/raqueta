'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, Download, Heart, MapPin, Share2, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getContrastText, resolveClubAccent, withAlpha } from '@/lib/club-accent';
import { usePublicClubBySlug } from '@/hooks/use-club';
import { useMyFavorites, useToggleFavorite } from '@/hooks/use-favorites';
import { useAuthStore } from '@/stores/auth.store';

const COURT_SURFACE_LABELS: Record<string, string> = {
  CLAY: 'Arcilla',
  HARD: 'Dura',
  GRASS: 'Césped',
  SYNTHETIC: 'Sintética',
  CARPET: 'Alfombra',
  INDOOR_HARD: 'Dura interior',
};

function getCourtPricing(court: any) {
  return {
    member: court.pricing?.find((item: any) => item.userType === 'MEMBER') ?? null,
    casual: court.pricing?.find((item: any) => item.userType === 'CASUAL') ?? null,
  };
}

function getSlotStatus(slot: any) {
  if (slot.available) return 'Disponible';
  if (!slot.isOpen) return 'Fuera de horario';
  if (slot.isBlocked) return 'Bloqueada';
  if (slot.isReserved) return 'Ocupada';
  return 'No disponible';
}

export default function ClubPublicPageClient({ slug }: { slug: string }) {
  const [selectedCourt, setSelectedCourt] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const statsCardRef = useRef<HTMLDivElement | null>(null);
  const { data: club, isLoading } = usePublicClubBySlug(slug);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data: favorites } = useMyFavorites();
  const toggleFavorite = useToggleFavorite(club?.id ?? '');

  const accentColor = resolveClubAccent(club?.profile?.resolvedAccentColor ?? club?.profile?.accentColor);
  const accentText = getContrastText(accentColor);
  const accentSoft = withAlpha(accentColor, '14');
  const accentBorder = withAlpha(accentColor, '33');

  const isFavorite = !!club && (favorites ?? []).some(f => f.clubId === club.id);

  const availability = useQuery({
    queryKey: ['club-public-availability', club?.id, selectedCourt, selectedDate],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${club.id}/availability?courtId=${selectedCourt}&date=${selectedDate}`);
      return data;
    },
    enabled: !!club?.id && !!selectedCourt,
  });

  const reserve = useMutation({
    mutationFn: async (slot: { startTime: string; endTime: string }) => {
      const { data } = await api.post('/reservations', {
        courtId: selectedCourt,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      return data;
    },
    onSuccess: () => {
      toast.success('Reserva creada correctamente');
      availability.refetch();
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo completar la reserva'),
  });

  if (isLoading) return <div className="mx-auto max-w-6xl px-6 py-16">Cargando club...</div>;
  if (!club) return <div className="mx-auto max-w-6xl px-6 py-16">Club no encontrado.</div>;

  const exportStatsCard = async (mode: 'download' | 'share') => {
    if (!statsCardRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(statsCardRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
    });
    const dataUrl = canvas.toDataURL('image/png');

    if (mode === 'share' && navigator.share) {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `${club.slug}-stats.png`, { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: `${club.name} · Estadísticas` });
        return;
      } catch {
        toast.error('No se pudo abrir el selector para compartir');
        return;
      }
    }

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `${club.slug}-stats.png`;
    anchor.click();
  };

  const courts = club.courts ?? [];
  const instructors = club.instructors ?? [];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7faf7_0%,#ffffff_22%,#f4f4f5_100%)]">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_20px_80px_rgba(17,24,39,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-8 sm:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Club de tenis</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">{club.name}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                {club.profile?.city && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {club.profile.city}</span>}
                {club.openingHours?.length > 0 && <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {club.openingHours.length} días configurados</span>}
                <span className="inline-flex items-center gap-2"><Trophy className="h-4 w-4" /> {courts.length} canchas activas</span>
              </div>
              {club.profile?.description && <p className="mt-8 max-w-2xl text-base leading-7 text-gray-600">{club.profile.description}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="#booking" className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5" style={{ backgroundColor: accentColor, color: accentText }}>
                  Reservar en este club
                </Link>
                {club.profile?.website && (
                  <a href={club.profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border px-5 py-3 text-sm font-semibold text-gray-700" style={{ borderColor: accentBorder, backgroundColor: accentSoft }}>
                    Sitio del club
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => toggleFavorite.mutate(isFavorite)}
                  disabled={!isAuthenticated || toggleFavorite.isPending}
                  title={isAuthenticated ? (isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos') : 'Inicia sesión para guardar'}
                  className={`inline-flex items-center rounded-full border px-5 py-3 text-sm font-semibold transition-colors ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${!isAuthenticated ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Heart
                    className={`mr-2 h-4 w-4 ${isFavorite ? 'fill-current text-rose-500' : ''}`}
                  />
                  {isFavorite ? 'En tus favoritos' : 'Agregar a favoritos'}
                </button>
              </div>
            </div>
            <div className="p-8 sm:p-10" style={{ backgroundColor: accentSoft }}>
              <div className="rounded-[28px] border bg-white/90 p-6 backdrop-blur" style={{ borderColor: accentBorder }}>
                <p className="text-sm font-semibold text-gray-500">Datos de contacto</p>
                <div className="mt-4 space-y-3 text-sm text-gray-700">
                  {club.profile?.address && <p>{club.profile.address}</p>}
                  {club.profile?.phone && <p>{club.profile.phone}</p>}
                  {club.profile?.email && <p>{club.profile.email}</p>}
                </div>
                <div className="mt-8 rounded-2xl p-5" style={{ backgroundColor: accentColor, color: accentText }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em]">Acento del club</p>
                  <p className="mt-3 text-2xl font-semibold">{club.profile?.resolvedAccentColor ?? accentColor}</p>
                  <p className="mt-2 text-sm">Este color solo se aplica a la experiencia pública y de reserva del club.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div ref={statsCardRef} className="rounded-[28px] border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Estadísticas públicas</p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">Resumen del club</h2>
              </div>
              <div className="flex gap-2 print:hidden">
                <button type="button" onClick={() => exportStatsCard('download')} className="inline-flex items-center rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
                  <Download className="mr-2 h-4 w-4" />
                  PNG
                </button>
                <button type="button" onClick={() => exportStatsCard('share')} className="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold" style={{ backgroundColor: accentColor, color: accentText }}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartir
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Socios activos', value: club.publicStatsCard?.activeMembers ?? 0 },
                { label: 'Canchas activas', value: club.publicStatsCard?.activeCourts ?? 0 },
                { label: 'Reservas jugadas', value: club.publicStatsCard?.completedReservations ?? 0 },
                { label: 'Torneos organizados', value: club.publicStatsCard?.tournamentsHosted ?? 0 },
              ].map(item => (
                <div key={item.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5" style={{ color: accentColor }} />
              <h2 className="text-xl font-semibold text-gray-900">Instructores</h2>
            </div>
            <div className="mt-6 space-y-4">
              {instructors.length ? instructors.map((instructor: any) => (
                <div key={instructor.id} className="rounded-2xl border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{instructor.name}</p>
                  <p className="mt-1 text-sm text-gray-600">{instructor.bio || 'Instructor activo del club'}</p>
                </div>
              )) : <p className="text-sm text-gray-500">Este club todavía no publica instructores activos.</p>}
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5" style={{ color: accentColor }} />
              <h2 className="text-xl font-semibold text-gray-900">Canchas</h2>
            </div>
            <div className="mt-6 space-y-4">
              {courts.map((court: any) => (
                <button
                  key={court.id}
                  type="button"
                  onClick={() => setSelectedCourt(court.id)}
                  className="w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5"
                  style={{ borderColor: selectedCourt === court.id ? accentColor : '#E5E7EB', backgroundColor: selectedCourt === court.id ? accentSoft : '#FFFFFF' }}
                >
                  {court.photoUrl ? (
                    <img src={court.photoUrl} alt={court.name} className="mb-4 h-40 w-full rounded-2xl object-cover" />
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{court.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{court.description || 'Cancha activa para reservas del club'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-gray-600">
                        <span className="rounded-full bg-gray-100 px-3 py-1">
                          {COURT_SURFACE_LABELS[court.surfaceType] ?? court.surfaceType}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1">
                          {court.indoor ? 'Cubierta' : 'Exterior'}
                        </span>
                      </div>
                      {(getCourtPricing(court).casual || getCourtPricing(court).member) ? (
                        <div className="mt-3 flex flex-wrap gap-3 text-sm">
                          {getCourtPricing(court).casual ? (
                            <span className="font-medium text-gray-700">
                              Casual: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(getCourtPricing(court).casual.price)}/hr
                            </span>
                          ) : null}
                          {getCourtPricing(court).member ? (
                            <span className="font-medium" style={{ color: accentColor }}>
                              Socio: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(getCourtPricing(court).member.price)}/hr
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: accentSoft, color: accentColor }}>
                      Disponible
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id="booking" className="rounded-[28px] border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Reserva online</h2>
          <p className="mt-2 text-sm text-gray-500">Selecciona una cancha y fecha para ver disponibilidad.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_180px]">
            <select className="input-field" value={selectedCourt} onChange={e => setSelectedCourt(e.target.value)}>
              <option value="">Selecciona una cancha</option>
              {courts.map((court: any) => <option key={court.id} value={court.id}>{court.name}</option>)}
            </select>
            <input className="input-field" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>

          <div className="mt-6 space-y-3">
            {!selectedCourt ? (
              <p className="text-sm text-gray-500">Elige una cancha para cargar horarios.</p>
            ) : availability.isLoading ? (
              <p className="text-sm text-gray-500">Cargando horarios...</p>
            ) : availability.data?.length ? (
              availability.data.map((slot: any) => (
                <div key={slot.startTime} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {new Date(slot.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {new Date(slot.endTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{slot.available ? 'Disponible' : 'No disponible'}</p>
                    {!slot.available ? <p className="mt-1 text-xs text-gray-400">{getSlotStatus(slot)}</p> : null}
                  </div>
                  <button
                    type="button"
                    disabled={!slot.available || reserve.isPending}
                    onClick={() => reserve.mutate(slot)}
                    className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: slot.available ? accentColor : '#E5E7EB', color: slot.available ? accentText : '#6B7280' }}
                  >
                    {slot.available ? 'Reservar' : 'Ocupado'}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No hay horarios disponibles para esa fecha.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
