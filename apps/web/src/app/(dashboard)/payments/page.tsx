'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, CreditCard, Banknote, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { usePayments } from '@/hooks/use-club';
import api from '@/lib/api';

const METHOD_LABELS: Record<string, string> = {
  MANUAL_CASH: 'Efectivo',
  MANUAL_CARD: 'Tarjeta',
  MANUAL_TRANSFER: 'Transferencia',
  ONLINE_CARD: 'Online',
  CLUB_CREDIT: 'Crédito club',
};

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: payments, isLoading } = usePayments(selectedClub?.id, { status: statusFilter || undefined });

  const confirmMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) =>
      api.post(`/payments/${id}/confirm-manual`, { method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Pago confirmado');
    },
    onError: () => toast.error('Error al confirmar pago'),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
        <select
          className="input-field w-auto"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="PENDING">Pendientes</option>
          <option value="PAID">Pagados</option>
          <option value="REFUNDED">Reembolsados</option>
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Monto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Método</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : payments?.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.user?.playerProfile?.displayName ?? p.user?.email}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCLP(p.amount)}</td>
                      <td className="px-4 py-3 text-gray-600 flex items-center gap-1.5">
                        {p.method === 'MANUAL_CASH' && <Banknote className="w-4 h-4 text-green-500" />}
                        {p.method === 'MANUAL_CARD' && <CreditCard className="w-4 h-4 text-blue-500" />}
                        {p.method === 'MANUAL_TRANSFER' && <ArrowLeftRight className="w-4 h-4 text-purple-500" />}
                        {METHOD_LABELS[p.method] ?? p.method}
                      </td>
                      <td className="px-4 py-3">
                        <span className={p.status === 'PAID' ? 'badge-green' : p.status === 'PENDING' ? 'badge-yellow' : 'badge-red'}>
                          {p.status === 'PAID' ? 'Pagado' : p.status === 'PENDING' ? 'Pendiente' : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {p.paidAt ? format(new Date(p.paidAt), 'dd/MM/yyyy HH:mm') : format(new Date(p.createdAt), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'PENDING' && (
                          <button
                            onClick={() => confirmMutation.mutate({ id: p.id, method: p.method })}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && (!payments || payments.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay pagos para mostrar</p>
          </div>
        )}
      </div>
    </div>
  );
}
