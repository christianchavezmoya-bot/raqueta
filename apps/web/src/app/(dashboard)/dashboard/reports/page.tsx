'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FileText, TrendingUp, Users, MapPin } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import api from '@/lib/api';

export default function ReportsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);

  const { data: revenue } = useQuery({
    queryKey: ['reports', 'revenue', selectedClub?.id],
    queryFn: async () => {
      const from = new Date(new Date().setDate(1)).toISOString();
      const to = new Date().toISOString();
      const { data } = await api.get(`/reports/clubs/${selectedClub?.id}/revenue?from=${from}&to=${to}`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: memberships } = useQuery({
    queryKey: ['reports', 'memberships', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/reports/clubs/${selectedClub?.id}/memberships`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: utilization } = useQuery({
    queryKey: ['reports', 'utilization', selectedClub?.id],
    queryFn: async () => {
      const from = new Date(new Date().setDate(1)).toISOString();
      const to = new Date().toISOString();
      const { data } = await api.get(`/reports/clubs/${selectedClub?.id}/court-utilization?from=${from}&to=${to}`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const methodLabels: Record<string, string> = {
    MANUAL_CASH: 'Efectivo',
    MANUAL_CARD: 'Tarjeta',
    MANUAL_TRANSFER: 'Transferencia',
  };

  const revenueByMethod = revenue?.byMethod
    ? Object.entries(revenue.byMethod).map(([k, v]) => ({
        name: methodLabels[k] ?? k,
        amount: v as number,
      }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>

      {/* Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Ingresos del mes</h2>
              <p className="text-xs text-gray-500">Pagos confirmados</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-1">{revenue ? formatCLP(revenue.total) : '—'}</p>
          <p className="text-sm text-gray-500">{revenue?.count ?? 0} transacciones</p>

          {revenueByMethod.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMethod} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCLP(v)} />
                  <Bar dataKey="amount" fill="#22c55e" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Memberships */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Membresías</h2>
              <p className="text-xs text-gray-500">Estado actual</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Activas', value: memberships?.active ?? 0, color: 'text-green-600 bg-green-50' },
              { label: 'Expiradas', value: memberships?.expired ?? 0, color: 'text-yellow-600 bg-yellow-50' },
              { label: 'Canceladas', value: memberships?.cancelled ?? 0, color: 'text-red-600 bg-red-50' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${color}`}>{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Total</span>
              <span className="text-sm font-bold text-gray-900">{memberships?.total ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Court utilization */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Utilización de canchas</h2>
            <p className="text-xs text-gray-500">Mes en curso</p>
          </div>
        </div>

        {utilization && utilization.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left py-2">Cancha</th>
                  <th className="text-right py-2">Reservas</th>
                  <th className="text-right py-2">Horas jugadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {utilization.map((c: any) => (
                  <tr key={c.courtId}>
                    <td className="py-3 font-medium text-gray-900">{c.courtName}</td>
                    <td className="py-3 text-right text-gray-600">{c.totalReservations}</td>
                    <td className="py-3 text-right text-gray-600">{c.totalHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin datos para el período</p>
          </div>
        )}
      </div>
    </div>
  );
}
