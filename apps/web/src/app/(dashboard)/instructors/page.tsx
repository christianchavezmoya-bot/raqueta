'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Award, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useInstructors } from '@/hooks/use-club';
import api from '@/lib/api';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function InstructorPhotoUpload({ instructorId, currentUrl }: { instructorId: string; currentUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Archivo demasiado grande (máx 5 MB)'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/instructors/${instructorId}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Foto actualizada');
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al subir foto');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex-shrink-0">
      {currentUrl ? (
        <img src={currentUrl} alt="Foto" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
      ) : (
        <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
          <Award className="w-6 h-6 text-purple-600" />
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Subir foto"
        className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-600 text-white rounded-full flex items-center justify-center shadow hover:bg-brand-700 disabled:opacity-50"
      >
        <Upload className="w-2.5 h-2.5" />
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
    </div>
  );
}

export default function InstructorsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: instructors, isLoading } = useInstructors(selectedClub?.id);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', experienceYears: 0, hourlyRate: 0, specialties: '' });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/instructors`, {
      ...data,
      specialties: data.specialties.split(',').map((s: string) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      toast.success('Instructor agregado');
      setShowForm(false);
    },
    onError: () => toast.error('Error al crear instructor'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/instructors/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instructors'] }),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Instructores</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Agregar instructor
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Nuevo instructor</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea className="input-field" rows={2} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Años de experiencia</label>
                  <input type="number" className="input-field" value={form.experienceYears} onChange={e => setForm(f => ({ ...f, experienceYears: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarifa/hora (CLP)</label>
                  <input type="number" className="input-field" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Especialidades (separadas por coma)</label>
                <input className="input-field" value={form.specialties} placeholder="Técnica base, Servicio, Volea" onChange={e => setForm(f => ({ ...f, specialties: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1" onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-48 animate-pulse bg-gray-100" />)
          : instructors?.map((inst: any) => (
              <div key={inst.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <InstructorPhotoUpload instructorId={inst.id} currentUrl={inst.photoUrl} />
                    <div>
                      <h3 className="font-semibold text-gray-900">{inst.name}</h3>
                      <p className="text-xs text-gray-500">{inst.experienceYears} años de experiencia</p>
                    </div>
                  </div>
                  <span className={inst.active ? 'badge-green' : 'badge-gray'}>
                    {inst.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {inst.bio && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{inst.bio}</p>}

                {inst.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {inst.specialties.slice(0, 3).map((s: string) => (
                      <span key={s} className="badge-gray text-xs">{s}</span>
                    ))}
                  </div>
                )}

                {inst.availability?.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {DAYS.map((day, i) => {
                      const avail = inst.availability.some((a: any) => a.dayOfWeek === i);
                      return (
                        <span key={day} className={`text-xs px-1.5 py-0.5 rounded ${avail ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-300'}`}>
                          {day}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  {inst.hourlyRate > 0 && (
                    <span className="text-sm font-semibold text-gray-900">{formatCLP(inst.hourlyRate)}/hr</span>
                  )}
                  <button
                    onClick={() => toggleMutation.mutate({ id: inst.id, active: !inst.active })}
                    className="text-xs text-gray-500 hover:text-gray-700 ml-auto"
                  >
                    {inst.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
      </div>

      {!isLoading && (!instructors || instructors.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay instructores registrados</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Agregar primer instructor</button>
        </div>
      )}
    </div>
  );
}
