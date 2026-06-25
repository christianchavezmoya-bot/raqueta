'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Mail, Send } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useClubAnnouncements } from '@/hooks/use-club';
import api from '@/lib/api';

export default function AnnouncementsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: announcements, isLoading } = useClubAnnouncements(selectedClub?.id);
  const [form, setForm] = useState({ title: '', body: '', sendEmail: false });

  const sendAnnouncement = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/clubs/${selectedClub?.id}/announcements`, form);
      return data;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['club-announcements', selectedClub?.id] });
      setForm({ title: '', body: '', sendEmail: false });
      toast.success(`Anuncio enviado a ${data.recipientCount} jugador(es)`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo enviar el anuncio'),
  });

  if (!selectedClub) {
    return <div className="card">Selecciona un club para administrar anuncios.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Anuncios del club</h1>
        <p className="mt-1 text-sm text-gray-500">Los anuncios llegan solo a socios activos o jugadores cuyo club base sea este club.</p>
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Alcance</p>
          <p className="mt-3 text-2xl font-semibold">Club actual: {selectedClub.name}</p>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            La audiencia se calcula con la unión de socios activos del club y jugadores cuyo home club sea este club.
            Si alguien pertenece a ambos grupos, recibe un solo aviso.
          </p>
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
            {announcements.map((announcement: any) => (
              <div key={announcement.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{announcement.title}</h3>
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
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Todavía no hay anuncios enviados para este club.</p>
        )}
      </div>
    </div>
  );
}
