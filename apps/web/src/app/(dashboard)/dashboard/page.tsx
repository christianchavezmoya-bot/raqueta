'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Users, CreditCard, Trophy, TrendingUp,
  MapPin, AlertCircle, CheckCircle2, Clock, Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useClubStore } from '@/stores/club.store';
import { useAuthStore } from '@/stores/auth.store';
import { useDashboardKPIs, useReservations, useClubs } from '@/hooks/use-club';
import StatCard from '@/components/dashboard/stat-card';
import api from '@/lib/api';
import { toast } from 'sonner';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const selectedClub = useClubStore(s => s.selectedClub);
  const setSelectedClub = useClubStore(s => s.setSelectedClub);
  const user = useAuthStore(s => s.user);
  const { data: clubs } = useClubs();
  const { data: kpis } = useDashboardKPIs(selectedClub?.id);
  const { data: todayReservations } = useReservations(selectedClub?.id, {
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (!selectedClub && clubs?.data?.length > 0) {
      setSelectedClub(clubs.data[0]);
    }
  }, [clubs, selectedClub, setSelectedClub]);

  if (!selectedClub && clubs?.data?.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500">No tienes ningún club configurado.</p>
        <Link href="/dashboard/settings" className="btn-primary">Crear club</Link>
      </div>
    );
  }

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/reservations" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva reserva
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          title="Reservas hoy"
          value={kpis?.todayReservations ?? '—'}
          subtitle="canchas reservadas hoy"
          icon={BookOpen}
          color="blue"
        />
        <StatCard
          title="Pagos pendientes"
          value={kpis?.pendingPayments ?? '—'}
          subtitle="por confirmar"
          icon={CreditCard}
          color="yellow"
        />
        <StatCard
          title="Socios activos"
          value={kpis?.activeMembers ?? '—'}
          subtitle="membresías vigentes"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Ingresos del mes"
          value={kpis ? formatCLP(kpis.monthRevenue) : '—'}
          subtitle="pagos confirmados"
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title="Canchas activas"
          value={kpis?.courts ?? '—'}
          subtitle="disponibles para reservar"
          icon={MapPin}
          color="green"
        />
        <StatCard
          title="Torneos activos"
          value={kpis?.upcomingTournaments ?? '—'}
          subtitle="en curso o inscripción abierta"
          icon={Trophy}
          color="red"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { href: '/dashboard/reservations', label: 'Ver reservas', icon: BookOpen },
          { href: '/dashboard/payments', label: 'Confirmar pagos', icon: CreditCard },
          { href: '/dashboard/players', label: 'Ver jugadores', icon: Users },
          { href: '/dashboard/tournaments', label: 'Ver torneos', icon: Trophy },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="card hover:shadow-md transition-shadow flex flex-col items-center gap-3 py-6 text-center cursor-pointer group"
          >
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center group-hover:bg-brand-100 transition-colors">
              <Icon className="w-6 h-6 text-brand-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* Today's reservations */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Reservas de hoy</h2>
          <Link href="/dashboard/reservations" className="text-sm text-brand-600 hover:underline">
            Ver todas →
          </Link>
        </div>

        {!todayReservations || todayReservations.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay reservas para hoy</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayReservations.slice(0, 8).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.user?.playerProfile?.displayName ?? r.user?.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.court?.name} · {format(new Date(r.startTime), 'HH:mm')} - {format(new Date(r.endTime), 'HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={r.paymentStatus === 'PAID' ? 'badge-green' : 'badge-yellow'}>
                    {r.paymentStatus === 'PAID' ? 'Pagado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
