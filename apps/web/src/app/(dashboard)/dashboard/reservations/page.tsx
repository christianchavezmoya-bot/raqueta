'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, BookOpen, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useReservations } from '@/hooks/use-club';
import api from '@/lib/api';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmada', className: 'badge-green' },
  PENDING_PAYMENT: { label: 'Pago pendiente', className: 'badge-yellow' },
  CANCELLED: { label: 'Cancelada', className: 'badge-red' },
  COMPLETED: { label: 'Completada', className: 'badge-gray' },
  NO_SHOW: { label: 'No se presentó', className: 'badge-red' },
};

export default function ReservationsPage() {
  const [date, setDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState('');
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();

  const { data: reservations, isLoading } = useReservations(selectedClub?.id, {
    date: format(date, 'yyyy-MM-dd'),
    status: statusFilter || undefined,
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => api.post(`/payments/${paymentId}/confirm-manual`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Pago confirmado');
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reservations/${id}/check-in`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Check-in realizado');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reservations/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Reserva cancelada');
    },
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Reservas</h1>
        <div className="flex gap-3">
          <select
            className="input-field w-auto"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="PENDING_PAYMENT">Pago pendiente</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Date navigator */}
      <div className="card py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate(d => subDays(d, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-900">
              {format(date, "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <p className="text-sm text-gray-500">{format(date, 'yyyy')}</p>
          </div>
          <button
            onClick={() => setDate(d => addDays(d, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary */}
      {reservations && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: reservations.length, color: 'text-gray-900' },
            { label: 'Confirmadas', value: reservations.filter((r: any) => r.status === 'CONFIRMED').length, color: 'text-green-600' },
            { label: 'Pago pendiente', value: reservations.filter((r: any) => r.paymentStatus === 'PENDING').length, color: 'text-yellow-600' },
            { label: 'Canceladas', value: reservations.filter((r: any) => r.status === 'CANCELLED').length, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card py-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reservations table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cancha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Horario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pago</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : reservations?.map((r: any) => {
                    const statusCfg = STATUS_CONFIG[r.status] ?? { label: r.status, className: 'badge-gray' };
                    const paymentCfg = r.paymentStatus === 'PAID'
                      ? { label: 'Pagado', className: 'badge-green' }
                      : { label: 'Pendiente', className: 'badge-yellow' };

                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {r.user?.playerProfile?.displayName ?? r.user?.email}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.court?.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {format(new Date(r.startTime), 'HH:mm')} – {format(new Date(r.endTime), 'HH:mm')}
                        </td>
                        <td className="px-4 py-3 font-medium">{formatCLP(r.price)}</td>
                        <td className="px-4 py-3">
                          <span className={statusCfg.className}>{statusCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={paymentCfg.className}>{paymentCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {r.status === 'PENDING_PAYMENT' && (
                              <button
                                onClick={() => checkInMutation.mutate(r.id)}
                                className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors"
                                title="Confirmar check-in"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {r.status !== 'CANCELLED' && r.status !== 'COMPLETED' && (
                              <button
                                onClick={() => cancelMutation.mutate(r.id)}
                                className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors"
                                title="Cancelar"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && (!reservations || reservations.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay reservas para este día</p>
          </div>
        )}
      </div>
    </div>
  );
}
