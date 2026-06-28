'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useClubs } from '@/hooks/use-club';
import { useMyFavorites, useToggleFavorite } from '@/hooks/use-favorites';
import { useAuthStore } from '@/stores/auth.store';

export default function ClubsExplorePage() {
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { data: clubsPayload, isLoading } = useClubs();
  const { data: favorites } = useMyFavorites();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const favoriteIds = new Set((favorites ?? []).map(f => f.clubId));

  const allClubs: any[] = clubsPayload?.data ?? [];
  const filtered = allClubs.filter(club => {
    if (search && !club.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (favoritesOnly && !favoriteIds.has(club.id)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7faf7_0%,#ffffff_22%,#f4f4f5_100%)]">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">
              Clubes
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950 sm:text-4xl">
              Explora clubes en N-Go
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Sigue cualquier club — sin membresía ni home club — para recibir sus
              anuncios en tu categoría preferida.
            </p>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-6 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar club..."
              className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setFavoritesOnly(v => !v)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                favoritesOnly
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <Heart
                className={`h-4 w-4 ${favoritesOnly ? 'fill-current text-rose-500' : ''}`}
              />
              Solo favoritos
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <Heart className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-semibold text-gray-900">
              {favoritesOnly
                ? 'Aún no tienes clubes favoritos'
                : 'No encontramos clubes con ese filtro'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {favoritesOnly
                ? 'Agrega clubes a favoritos desde su página pública.'
                : 'Prueba con otro término de búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((club: any) => (
              <ClubCard
                key={club.id}
                club={club}
                isFavorite={favoriteIds.has(club.id)}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClubCard({
  club,
  isFavorite,
  isAuthenticated,
}: {
  club: any;
  isFavorite: boolean;
  isAuthenticated: boolean;
}) {
  const toggleFavorite = useToggleFavorite(club.id);
  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
      <Link
        href={`/clubs/${club.slug}`}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={`Ver ${club.name}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <span className="text-lg font-bold">{club.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">
              {club.name}
            </h3>
            {club.profile?.city && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {club.profile.city}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            if (!isAuthenticated) {
              toast.error('Inicia sesión para agregar favoritos');
              return;
            }
            toggleFavorite.mutate(isFavorite);
          }}
          disabled={toggleFavorite.isPending}
          className={`z-10 rounded-full p-2 transition-colors ${
            isFavorite
              ? 'text-rose-500 hover:bg-rose-50'
              : 'text-gray-400 hover:bg-gray-100 hover:text-rose-500'
          }`}
          title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <Heart
            className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`}
          />
        </button>
      </div>
      <div className="z-10 mt-auto flex items-center justify-between text-xs text-gray-500">
        <span>{club.publicStatsCard?.activeCourts ?? 0} canchas</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            club.status === 'ACTIVE'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {club.status}
        </span>
      </div>
    </div>
  );
}
