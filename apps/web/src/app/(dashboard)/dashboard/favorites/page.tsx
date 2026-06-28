'use client';

import Link from 'next/link';
import { Heart, MapPin, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMyFavorites, useToggleFavorite } from '@/hooks/use-favorites';

export default function FavoritesPage() {
  const { data: favorites, isLoading } = useMyFavorites();
  const toggleFavorite = useToggleFavorite('');
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis clubes favoritos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sigue cualquier club — sin necesidad de membresía ni de tenerlo como home
          club. Mientras no silencies su categoría, recibirás sus anuncios.
        </p>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" />
          <h2 className="font-semibold text-gray-900">
            {favorites?.length ?? 0} clubes en favoritos
          </h2>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : favorites?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map(fav => (
              <div
                key={fav.id}
                className="group relative flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <Link
                  href={`/clubs/${fav.club.slug}`}
                  className="absolute inset-0 z-0 rounded-2xl"
                  aria-label={`Ver ${fav.club.name}`}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="z-10 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <span className="text-lg font-bold">
                        {fav.club.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">
                        {fav.club.name}
                      </h3>
                      {fav.club.profile?.city && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3" />
                          {fav.club.profile.city}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      toggleFavorite.mutate(true, {
                        onSettled: () => queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
                      });
                    }}
                    className="z-10 rounded-full p-2 text-rose-500 hover:bg-rose-50"
                    title="Quitar de favoritos"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </button>
                </div>
                <div className="z-10 mt-auto flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Agregado el {new Date(fav.createdAt).toLocaleDateString('es-CL')}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      fav.club.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {fav.club.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-semibold text-gray-900">
              Aún no tienes clubes favoritos
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Entra a la página pública de cualquier club y presiona
              <span className="mx-1 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                <Heart className="mr-1 h-3 w-3 fill-current" />
                Agregar a favoritos
              </span>
              para empezar a seguirlo.
            </p>
            <Link
              href="/clubs"
              className="mt-4 inline-flex items-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Explorar clubes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
