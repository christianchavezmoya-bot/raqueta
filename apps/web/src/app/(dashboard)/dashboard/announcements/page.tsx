'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, Mail, Send, CalendarDays, Tag, Sparkles, Crown, Swords,
} from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useClubAnnouncements } from '@/hooks/use-club';
import api from '@/lib/api';

type AnnouncementCategory = 'EVENTS' | 'OFFERS' | 'MEMBERSHIP_OFFERS' | 'MATCH_FINDING';

const CATEGORY_OPTIONS: Array<{
  key: AnnouncementCategory;
  label: string;
  description: string;
  icon: typeof CalendarDays;
  accent: string;
}> = [
  {
    key: 'EVENTS',
    label: 'Eventos',
    description: 'Torneos, clínicas, clases, actividades del club.',
    icon: CalendarDays,
    accent: 'border-brand-500 bg-brand-50 text-brand-700',
  },
  {
    key: 'OFFERS',
    label: 'Ofertas generales',
    description: 'Promociones, descuentos o anuncios comerciales.',
    icon: Tag,
    accent: 'border-amber-500 bg-amber-50 text-amber-700',
  },
  {
    key: 'MEMBERSHIP_OFFERS',
    label: 'Ofertas de membresía',
    description: 'Promos exclusivas para socios o nuevas membresías.',
    icon: Crown,
    accent: 'border-purple-500 bg-purple-50 text-purple-700',
  },
  {
    key: 'MATCH_FINDING',
    label: 'Búsqueda de partidos',
    description: 'Nudges para encontrar rivales o completar partidos.',
    icon: Swords,
    accent: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
];

export default function AnnouncementsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: announcements, isLoading } = useClubAnnouncements(selectedClub?.id);
  const [form, setForm] = useState<{
    title: string;
    body: string;
    category: AnnouncementCategory;
    sendEmail: boolean;
  }>({ title: '', body: '', category: 'EVENTS', sendEmail: false });

  const sendAnnouncement = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/clubs/${selectedClub?.id}/announcements`, form);
      return data;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['club-announcements', selectedClub?.id] });
      setForm({ title: '', body: '', category: 'EVENTS', sendEmail: false });
      toast.success(`Anuncio enviado a ${data.recipientCount} jugador(es)`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo enviar el anuncio'),
  });

  if (!selectedClub) {
    return <div className="card">Selecciona un club para administrar anuncios.</div>;
  }

  const selectedCategory = CATEGORY_OPTIONS.find(c => c.key === form.category)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Anuncios del club</h1>
        <p className="mt-1 text-sm text-gray-500">
          Los anuncios llegan a socios activos, jugadores con este club como home club,
          y a cualquier jugador que tenga este club en sus favoritos — siempre que no
          hayan silenciado la categoría correspondiente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">Enviar anuncio</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
              <input
                className="input-field"
                value={form.title}
                maxLength={120}
                onChange={e => setForm(current => ({ ...current, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mensaje</label>
              <textarea
                className="input-field"
                rows={6}
                value={form.body}
                maxLength={5000}
                onChange={e => setForm(current => ({ ...current, body: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Categoría
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CATEGORY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = form.category === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setForm(current => ({ ...current, category: opt.key }))}
                      className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition ${
                        active
                          ? opt.accent
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{opt.label}</div>
                        <div className="mt-0.5 text-xs leading-5 opacity-80">
                          {opt.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Jugadores que silenciaron esta categoría en su configuración no la verán.
                Notificaciones transaccionales (reservas, 2FA, pagos, invitaciones) no se
                ven afectadas.
              </p>
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.sendEmail}
                onChange={e => setForm(current => ({ ...current, sendEmail: e.target.checked }))}
              />
              <Mail className="h-4 w-4 text-gray-500" />
              Enviar también por email
            </label>
            <button
              className="btn-primary"
              disabled={!form.title.trim() || !form.body.trim() || sendAnnouncement.isPending}
              onClick={() => sendAnnouncement.mutate()}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendAnnouncement.isPending ? 'Enviando...' : 'Enviar anuncio'}
            </button>
          </div>
        </div>

        <div className="card bg-gray-900 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            Alcance
          </p>
          <p className="mt-3 text-2xl font-semibold">Club actual: {selectedClub.name}</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2">
            <selectedCategory.icon className="h-4 w-4 text-brand-400" />
            <span className="text-sm font-semibold">{selectedCategory.label}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-gray-300">
            La audiencia se calcula con la unión de socios activos, jugadores con este club
            como home club, y jugadores que lo agregaron a favoritos. Si alguien silenció
            la categoría, queda excluido. Las notificaciones transaccionales (reservas,
            códigos 2FA, pagos, invitaciones directas de partido) no pasan por este
            filtro.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-gray-700 bg-gray-800/60 p-3 text-xs text-gray-300">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <span>
              <strong>Tip:</strong> jugadores sin membresía ni home club ahora pueden
              seguir a este club agregándolo a favoritos. Si silencian esta categoría,
              dejan de recibirla automáticamente.
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-gray-900">Historial</h2>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          </div>
        ) : announcements?.length ? (
          <div className="space-y-4">
            {announcements.map((announcement: any) => {
              const cat = CATEGORY_OPTIONS.find(c => c.key === announcement.category);
              const Icon = cat?.icon ?? CalendarDays;
              return (
                <div key={announcement.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cat?.accent ?? 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {cat?.label ?? announcement.category}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900">{announcement.title}</h3>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                        {new Date(announcement.createdAt).toLocaleString('es-CL')}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                      {announcement._count?.notifications ?? 0} notificaciones
                    </span>
                  </div>
                  <p className="mt-4 whitespace-pre-line text-sm leading-6 text-gray-700">{announcement.body}</p>
                  <p className="mt-4 text-xs text-gray-500">
                    Enviado por {announcement.sentByUser?.playerProfile?.displayName || announcement.sentByUser?.email}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Todavía no hay anuncios enviados para este club.</p>
        )}
      </div>
    </div>
  );
}
