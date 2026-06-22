import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardKPIs(clubId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todayReservations,
      pendingPayments,
      activeMembers,
      monthRevenue,
      courts,
      upcomingTournaments,
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
    ]);

    return {
      todayReservations,
      pendingPayments,
      activeMembers,
      monthRevenue: monthRevenue._sum.amount ?? 0,
      courts,
      upcomingTournaments,
    };
  }

  async getRevenueReport(clubId: string, from: Date, to: Date) {
    const payments = await this.prisma.payment.findMany({
      where: { clubId, status: 'PAID', paidAt: { gte: from, lte: to } },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { paidAt: 'asc' },
    });

    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const byMethod = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

    return { total, byMethod, payments, count: payments.length };
  }

  async getMembershipReport(clubId: string) {
    const [active, expired, cancelled, byPlan] = await Promise.all([
      this.prisma.membership.count({ where: { clubId, status: 'ACTIVE' } }),
      this.prisma.membership.count({ where: { clubId, status: 'EXPIRED' } }),
      this.prisma.membership.count({ where: { clubId, status: 'CANCELLED' } }),
      this.prisma.membership.groupBy({
        by: ['planId'],
        where: { clubId, status: 'ACTIVE' },
        _count: true,
      }),
    ]);

    return { active, expired, cancelled, total: active + expired + cancelled, byPlan };
  }

  async getCourtUtilizationReport(clubId: string, from: Date, to: Date) {
    const courts = await this.prisma.court.findMany({
      where: { clubId },
      include: {
        reservations: {
          where: { startTime: { gte: from }, endTime: { lte: to }, status: 'COMPLETED' },
        },
      },
    });

    return courts.map(court => ({
      courtId: court.id,
      courtName: court.name,
      totalReservations: court.reservations.length,
      totalHours: court.reservations.reduce(
        (sum, r) => sum + (r.endTime.getTime() - r.startTime.getTime()) / 3600000,
        0,
      ),
    }));
  }
}
