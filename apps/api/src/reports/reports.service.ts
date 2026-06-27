import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

type ExportableReport = 'dashboard' | 'revenue' | 'memberships' | 'court-utilization';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardKPIs(clubId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const activeSeason = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });

    const [
      todayReservations,
      pendingPayments,
      activeMembers,
      monthRevenue,
      courts,
      upcomingTournaments,
      rankingDistribution,
    ] = await Promise.all([
      this.prisma.reservation.count({
        where: { clubId, startTime: { gte: today, lt: tomorrow } },
      }),
      this.prisma.payment.count({
        where: { clubId, status: 'PENDING' },
      }),
      this.prisma.membership.count({
        where: { clubId, status: 'ACTIVE' },
      }),
      this.prisma.payment.aggregate({
        where: { clubId, status: 'PAID', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.court.count({ where: { clubId, active: true } }),
      this.prisma.tournament.count({
        where: { clubId, startDate: { gte: today }, status: { in: ['REGISTRATION_OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.clubRankingEntry.groupBy({
        by: ['division'],
        where: {
          clubId,
          ...(activeSeason?.id ? { seasonId: activeSeason.id } : {}),
        },
        _count: true,
      }),
    ]);

    return {
      todayReservations,
      pendingPayments,
      activeMembers,
      monthRevenue: monthRevenue._sum.amount ?? 0,
      courts,
      upcomingTournaments,
      rankingDistribution: rankingDistribution.map(entry => ({
        division: entry.division ?? 'Sin división',
        count: entry._count,
      })),
    };
  }

  async getRevenueReport(clubId: string, from: Date, to: Date) {
    const payments = await this.prisma.payment.findMany({
      where: { clubId, status: 'PAID', paidAt: { gte: from, lte: to } },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { paidAt: 'asc' },
    });

    const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const byMethod = payments.reduce((acc, payment) => {
      acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    const trend = payments.reduce((acc, payment) => {
      const key = this.toMonthKey(payment.paidAt ?? payment.createdAt);
      const bucket = acc[key] ?? { month: key, amount: 0, count: 0 };
      bucket.amount += payment.amount;
      bucket.count += 1;
      acc[key] = bucket;
      return acc;
    }, {} as Record<string, { month: string; amount: number; count: number }>);

    return {
      total,
      byMethod,
      trend: Object.values(trend).sort((a, b) => a.month.localeCompare(b.month)),
      payments,
      count: payments.length,
      from,
      to,
    };
  }

  async getMembershipReport(clubId: string) {
    const [active, expired, cancelled, byPlan, memberships] = await Promise.all([
      this.prisma.membership.count({ where: { clubId, status: 'ACTIVE' } }),
      this.prisma.membership.count({ where: { clubId, status: 'EXPIRED' } }),
      this.prisma.membership.count({ where: { clubId, status: 'CANCELLED' } }),
      this.prisma.membership.groupBy({
        by: ['planId'],
        where: { clubId, status: 'ACTIVE' },
        _count: true,
      }),
      this.prisma.membership.findMany({
        where: { clubId },
        select: { startDate: true, status: true },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    const growthTrendMap: Record<string, { month: string; newMemberships: number; activeStarted: number }> = {};
    for (const membership of memberships) {
      const month = this.toMonthKey(membership.startDate);
      const bucket = growthTrendMap[month] ?? { month, newMemberships: 0, activeStarted: 0 };
      bucket.newMemberships += 1;
      if (membership.status === 'ACTIVE') bucket.activeStarted += 1;
      growthTrendMap[month] = bucket;
    }

    return {
      active,
      expired,
      cancelled,
      total: active + expired + cancelled,
      byPlan,
      growthTrend: Object.values(growthTrendMap).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  async getCourtUtilizationReport(clubId: string, from: Date, to: Date) {
    const courts = await this.prisma.court.findMany({
      where: { clubId },
      include: {
        reservations: {
          where: {
            startTime: { gte: from, lte: to },
            status: 'COMPLETED',
          },
        },
      },
    });

    const trendMap: Record<string, { month: string; totalHours: number; totalReservations: number }> = {};
    for (const court of courts) {
      for (const reservation of court.reservations) {
        const month = this.toMonthKey(reservation.startTime);
        const bucket = trendMap[month] ?? { month, totalHours: 0, totalReservations: 0 };
        bucket.totalHours += (reservation.endTime.getTime() - reservation.startTime.getTime()) / 3600000;
        bucket.totalReservations += 1;
        trendMap[month] = bucket;
      }
    }

    return {
      items: courts.map(court => ({
        courtId: court.id,
        courtName: court.name,
        totalReservations: court.reservations.length,
        totalHours: court.reservations.reduce(
          (sum, reservation) => sum + (reservation.endTime.getTime() - reservation.startTime.getTime()) / 3600000,
          0,
        ),
      })),
      trend: Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month)),
      from,
      to,
    };
  }

  async exportReportPdf(
    clubId: string,
    reportType: ExportableReport,
    options: { from?: Date; to?: Date } = {},
  ) {
    if (reportType === 'dashboard') {
      const data = await this.getDashboardKPIs(clubId);
      return this.renderPdf('Dashboard del club', [
        { label: 'Reservas de hoy', value: String(data.todayReservations) },
        { label: 'Pagos pendientes', value: String(data.pendingPayments) },
        { label: 'Socios activos', value: String(data.activeMembers) },
        { label: 'Ingresos del mes', value: this.formatCLP(data.monthRevenue) },
        { label: 'Canchas activas', value: String(data.courts) },
        { label: 'Torneos próximos', value: String(data.upcomingTournaments) },
      ], [
        {
          heading: 'Distribución de ranking por división',
          rows: data.rankingDistribution.map(entry => [entry.division, String(entry.count)]),
        },
      ]);
    }

    if (reportType === 'revenue') {
      const data = await this.getRevenueReport(clubId, options.from!, options.to!);
      return this.renderPdf('Reporte de ingresos', [
        { label: 'Periodo', value: `${options.from?.toISOString().slice(0, 10)} a ${options.to?.toISOString().slice(0, 10)}` },
        { label: 'Ingresos totales', value: this.formatCLP(data.total) },
        { label: 'Transacciones', value: String(data.count) },
      ], [
        {
          heading: 'Ingresos por método',
          rows: Object.entries(data.byMethod).map(([method, amount]) => [method, this.formatCLP(amount)]),
        },
        {
          heading: 'Tendencia mensual',
          rows: data.trend.map(entry => [entry.month, this.formatCLP(entry.amount), String(entry.count)]),
        },
      ]);
    }

    if (reportType === 'memberships') {
      const data = await this.getMembershipReport(clubId);
      return this.renderPdf('Reporte de membresías', [
        { label: 'Activas', value: String(data.active) },
        { label: 'Expiradas', value: String(data.expired) },
        { label: 'Canceladas', value: String(data.cancelled) },
        { label: 'Total', value: String(data.total) },
      ], [
        {
          heading: 'Crecimiento mensual',
          rows: data.growthTrend.map(entry => [
            entry.month,
            String(entry.newMemberships),
            String(entry.activeStarted),
          ]),
        },
      ]);
    }

    const data = await this.getCourtUtilizationReport(clubId, options.from!, options.to!);
    return this.renderPdf('Utilización de canchas', [
      { label: 'Periodo', value: `${options.from?.toISOString().slice(0, 10)} a ${options.to?.toISOString().slice(0, 10)}` },
      { label: 'Canchas incluidas', value: String(data.items.length) },
    ], [
      {
        heading: 'Detalle por cancha',
        rows: data.items.map(item => [
          item.courtName,
          String(item.totalReservations),
          `${item.totalHours.toFixed(1)}h`,
        ]),
      },
      {
        heading: 'Tendencia mensual',
        rows: data.trend.map(entry => [entry.month, `${entry.totalHours.toFixed(1)}h`, String(entry.totalReservations)]),
      },
    ]);
  }

  private renderPdf(
    title: string,
    summary: Array<{ label: string; value: string }>,
    sections: Array<{ heading: string; rows: string[][] }>,
  ) {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>(resolve => {
      doc.on('data', chunk => chunks.push(chunk as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(20).fillColor('#111827').text(title);
      doc.moveDown(0.75);
      doc.fontSize(10).fillColor('#6B7280').text(`Generado: ${new Date().toISOString()}`);
      doc.moveDown(1.2);

      doc.fontSize(13).fillColor('#111827').text('Resumen');
      doc.moveDown(0.4);
      for (const item of summary) {
        doc.fontSize(11).fillColor('#111827').text(`${item.label}: ${item.value}`);
      }

      for (const section of sections) {
        doc.moveDown(1.2);
        doc.fontSize(13).fillColor('#111827').text(section.heading);
        doc.moveDown(0.4);

        if (!section.rows.length) {
          doc.fontSize(10).fillColor('#6B7280').text('Sin datos para este bloque.');
          continue;
        }

        for (const row of section.rows) {
          doc.fontSize(10).fillColor('#111827').text(row.join('  |  '));
        }
      }

      doc.end();
    });
  }

  private formatCLP(value: number) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private toMonthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
