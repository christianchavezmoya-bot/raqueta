'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileText, Printer, TrendingUp, Users, MapPin, Trophy } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import api from '@/lib/api';

export default function ReportsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const to = new Date().toISOString();

  const { data: dashboard } = useQuery({
    queryKey: ['reports', 'dashboard', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/reports/clubs/${selectedClub?.id}/dashboard`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const { data: revenue } = useQuery({
    queryKey: ['reports', 'revenue', selectedClub?.id, from, to],
    queryFn: async () => {
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
    queryKey: ['reports', 'utilization', selectedClub?.id, from, to],
    queryFn: async () => {
      const { data } = await api.get(`/reports/clubs/${selectedClub?.id}/court-utilization?from=${from}&to=${to}`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);

  const exportPdf = async (path: string) => {
    if (!selectedClub?.id) return;
    const response = await api.get(path, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path.split('/').slice(-2).join('-') + '.pdf';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const methodLabels: Record<string, string> = {
    MANUAL_CASH: 'Efectivo',
    MANUAL_CARD: 'Tarjeta',
    MANUAL_TRANSFER: 'Transferencia',
  };

  const revenueByMethod = revenue?.byMethod
    ? Object.entries(revenue.byMethod).map(([method, amount]) => ({
        name: methodLabels[method] ?? method,
        amount: amount as number,
      }))
    : [];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
            <p className="text-sm text-gray-500">PDF exportable y vista lista para impresión del club seleccionado.</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </button>
            <button
              className="btn-primary"
              onClick={() => exportPdf(`/reports/clubs/${selectedClub?.id}/dashboard/export?format=pdf`)}
              disabled={!selectedClub?.id}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar dashboard
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Reservas hoy', value: dashboard?.todayReservations ?? 0, icon: FileText, tone: 'text-green-600 bg-green-50' },
            { label: 'Pagos pendientes', value: dashboard?.pendingPayments ?? 0, icon: TrendingUp, tone: 'text-amber-600 bg-amber-50' },
            { label: 'Socios activos', value: dashboard?.activeMembers ?? 0, icon: Users, tone: 'text-blue-600 bg-blue-50' },
            { label: 'Ingresos del mes', value: dashboard ? formatCLP(dashboard.monthRevenue ?? 0) : '—', icon: Trophy, tone: 'text-violet-600 bg-violet-50' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Ingresos del mes</h2>
                <p className="text-xs text-gray-500">Pagos confirmados y evolución mensual</p>
              </div>
            </div>
            <button
              className="btn-secondary print:hidden"
              onClick={() => exportPdf(`/reports/clubs/${selectedClub?.id}/revenue/export?format=pdf&from=${from}&to=${to}`)}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </button>
          </div>

          <p className="text-3xl font-bold text-gray-900">{revenue ? formatCLP(revenue.total) : '—'}</p>
          <p className="mt-1 text-sm text-gray-500">{revenue?.count ?? 0} transacciones</p>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMethod}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={value => `$${Math.round(value / 1000)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCLP(value)} />
                  <Bar dataKey="amount" fill="#22c55e" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue?.trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={value => `$${Math.round(value / 1000)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCLP(value)} />
                  <Bar dataKey="amount" fill="#16a34a" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="card print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Membresías</h2>
                <p className="text-xs text-gray-500">Estado actual y crecimiento mensual</p>
              </div>
            </div>
            <button
              className="btn-secondary print:hidden"
              onClick={() => exportPdf(`/reports/clubs/${selectedClub?.id}/memberships/export?format=pdf`)}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Activas', value: memberships?.active ?? 0, tone: 'text-green-700 bg-green-50' },
              { label: 'Expiradas', value: memberships?.expired ?? 0, tone: 'text-amber-700 bg-amber-50' },
              { label: 'Canceladas', value: memberships?.cancelled ?? 0, tone: 'text-red-700 bg-red-50' },
            ].map(({ label, value, tone }) => (
              <div key={label} className="rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
                <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-lg font-semibold ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberships?.growthTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="newMemberships" fill="#2563eb" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="card print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Utilización de canchas</h2>
                <p className="text-xs text-gray-500">Detalle por cancha y tendencia mensual</p>
              </div>
            </div>
            <button
              className="btn-secondary print:hidden"
              onClick={() => exportPdf(`/reports/clubs/${selectedClub?.id}/court-utilization/export?format=pdf&from=${from}&to=${to}`)}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 text-left">Cancha</th>
                  <th className="py-2 text-right">Reservas</th>
                  <th className="py-2 text-right">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(utilization?.items ?? []).map((court: any) => (
                  <tr key={court.courtId}>
                    <td className="py-3 font-medium text-gray-900">{court.courtName}</td>
                    <td className="py-3 text-right text-gray-600">{court.totalReservations}</td>
                    <td className="py-3 text-right text-gray-600">{court.totalHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilization?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}h`} />
                <Bar dataKey="totalHours" fill="#7c3aed" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card print:break-inside-avoid">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Distribución por división</h2>
              <p className="text-xs text-gray-500">Basado en el ranking activo del club</p>
            </div>
          </div>

          {dashboard?.rankingDistribution?.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.rankingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="division" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
              Sin datos de ranking para la temporada activa.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
