'use client';

import { Bell, CalendarDays, Tag, Crown, Swords, Info } from 'lucide-react';
import {
  useMyNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationCategoryKey,
} from '@/hooks/use-favorites';

type CategoryDef = {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  icon: typeof CalendarDays;
};

const CATEGORY_OPTIONS: CategoryDef[] = [
  {
    key: 'EVENTS',
    label: 'Eventos',
    description: 'Torneos, clínicas, clases y otras actividades del club.',
    icon: CalendarDays,
  },
  {
    key: 'OFFERS',
    label: 'Ofertas generales',
    description: 'Promociones, descuentos y novedades comerciales.',
    icon: Tag,
  },
  {
    key: 'MEMBERSHIP_OFFERS',
    label: 'Ofertas de membresía',
    description: 'Promos especiales para socios y nuevos planes.',
    icon: Crown,
  },
  {
    key: 'MATCH_FINDING',
    label: 'Búsqueda de partidos',
    description: 'Nudges para encontrar rivales y completar partidos abiertos.',
    icon: Swords,
  },
];

export default function NotificationPreferencesPage() {
  const { data: prefs, isLoading } = useMyNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
        <p className="mt-1 text-sm text-gray-500">
          Decide qué categorías de anuncios quieres recibir de tus clubes favoritos.
          Cada categoría se silencia de forma independiente — silenciar una no
          afecta a las demás.
        </p>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Categorías</h2>
        </div>

        {isLoading || !prefs ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          </div>
        ) : (
          <div className="space-y-3">
            {CATEGORY_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const enabled =
                opt.key === 'EVENTS'
                  ? prefs.notifyEvents
                  : opt.key === 'OFFERS'
                  ? prefs.notifyOffers
                  : opt.key === 'MEMBERSHIP_OFFERS'
                  ? prefs.notifyMembershipOffers
                  : prefs.notifyMatchFinding;

              return (
                <label
                  key={opt.key}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                      <div className="mt-0.5 text-xs leading-5 text-gray-600">
                        {opt.description}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate(
                        opt.key === 'EVENTS'
                          ? { notifyEvents: !enabled }
                          : opt.key === 'OFFERS'
                          ? { notifyOffers: !enabled }
                          : opt.key === 'MEMBERSHIP_OFFERS'
                          ? { notifyMembershipOffers: !enabled }
                          : { notifyMatchFinding: !enabled },
                      )
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      enabled ? 'bg-brand-600' : 'bg-gray-200'
                    } ${update.isPending ? 'opacity-60' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <strong>Estas preferencias solo afectan anuncios por categoría.</strong>{' '}
            Las notificaciones transaccionales —confirmaciones de reserva, códigos
            de verificación en 2 pasos, confirmaciones de pago, invitaciones
            directas de partido, aprobaciones de vínculo padre-hijo, cambios de
            rol— siempre llegan independientemente de esta configuración.
          </div>
        </div>
      </div>
    </div>
  );
}
