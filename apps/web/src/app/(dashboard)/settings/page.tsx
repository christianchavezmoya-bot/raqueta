'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, Clock, MapPin } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useClub } from '@/hooks/use-club';
import api from '@/lib/api';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function SettingsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const { data: club, isLoading } = useClub(selectedClub?.id);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'profile' | 'hours'>('profile');

  const [profileForm, setProfileForm] = useState({
    description: '', address: '', city: '', region: '',
    phone: '', whatsapp: '', email: '', instagram: '',
    website: '', rules: '', cancellationPolicy: '',
  });

  const [hours, setHours] = useState(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i, openTime: '07:00', closeTime: '22:00', isClosed: false,
    })),
  );

  useEffect(() => {
    if (club?.profile) {
      setProfileForm({
        description: club.profile.description ?? '',
        address: club.profile.address ?? '',
        city: club.profile.city ?? '',
        region: club.profile.region ?? '',
        phone: club.profile.phone ?? '',
        whatsapp: club.profile.whatsapp ?? '',
        email: club.profile.email ?? '',
        instagram: club.profile.instagram ?? '',
        website: club.profile.website ?? '',
        rules: club.profile.rules ?? '',
        cancellationPolicy: club.profile.cancellationPolicy ?? '',
      });
    }
    if (club?.openingHours?.length > 0) {
      const hoursMap = Object.fromEntries(club.openingHours.map((h: any) => [h.dayOfWeek, h]));
      setHours(Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        openTime: hoursMap[i]?.openTime ?? '07:00',
        closeTime: hoursMap[i]?.closeTime ?? '22:00',
        isClosed: hoursMap[i]?.isClosed ?? false,
      })));
    }
  }, [club]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/clubs/${selectedClub?.id}/profile`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });
      toast.success('Perfil actualizado');
    },
    onError: () => toast.error('Error al actualizar perfil'),
  });

  const updateHoursMutation = useMutation({
    mutationFn: (data: any) => api.put(`/clubs/${selectedClub?.id}/opening-hours`, { hours: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });
      toast.success('Horarios actualizados');
    },
    onError: () => toast.error('Error al actualizar horarios'),
  });

  if (isLoading) return <div className="card animate-pulse h-64" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración del club</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: 'profile', label: 'Perfil', icon: Settings },
          { key: 'hours', label: 'Horarios', icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card max-w-2xl">
          <h2 className="font-semibold text-gray-900 mb-4">Información del club</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea className="input-field" rows={3} value={profileForm.description}
                onChange={e => setProfileForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input className="input-field" value={profileForm.address}
                  onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <input className="input-field" value={profileForm.city}
                  onChange={e => setProfileForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input className="input-field" value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                <input className="input-field" value={profileForm.whatsapp}
                  onChange={e => setProfileForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" className="input-field" value={profileForm.email}
                  onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                <input className="input-field" value={profileForm.instagram}
                  onChange={e => setProfileForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reglamento</label>
              <textarea className="input-field" rows={3} value={profileForm.rules}
                onChange={e => setProfileForm(f => ({ ...f, rules: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Política de cancelación</label>
              <textarea className="input-field" rows={2} value={profileForm.cancellationPolicy}
                onChange={e => setProfileForm(f => ({ ...f, cancellationPolicy: e.target.value }))} />
            </div>
          </div>
          <button
            className="btn-primary mt-6"
            onClick={() => updateProfileMutation.mutate(profileForm)}
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {tab === 'hours' && (
        <div className="card max-w-2xl">
          <h2 className="font-semibold text-gray-900 mb-4">Horarios de apertura</h2>
          <div className="space-y-3">
            {hours.map((hour, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-50">
                <div className="w-24 text-sm font-medium text-gray-700">{DAYS[i]}</div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hour.isClosed}
                    onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, isClosed: e.target.checked } : d))}
                    className="rounded"
                  />
                  Cerrado
                </label>
                {!hour.isClosed && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="time"
                      className="input-field py-1 w-28"
                      value={hour.openTime}
                      onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, openTime: e.target.value } : d))}
                    />
                    <span className="text-gray-400 text-sm">–</span>
                    <input
                      type="time"
                      className="input-field py-1 w-28"
                      value={hour.closeTime}
                      onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, closeTime: e.target.value } : d))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="btn-primary mt-6"
            onClick={() => updateHoursMutation.mutate(hours)}
            disabled={updateHoursMutation.isPending}
          >
            {updateHoursMutation.isPending ? 'Guardando...' : 'Guardar horarios'}
          </button>
        </div>
      )}
    </div>
  );
}
