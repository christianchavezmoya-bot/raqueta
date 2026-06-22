import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async findByClub(clubId: string, filters?: { status?: string; method?: string }) {
    const where: any = { clubId };
    if (filters?.status) where.status = filters.status;
    if (filters?.method) where.method = filters.method;
    return this.prisma.payment.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, playerProfile: true } },
        reservation: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    clubId: string;
    userId: string;
    amount: number;
    currency?: string;
    method: string;
    reservationId?: string;
    tournamentRegistrationId?: string;
    membershipId?: string;
    notes?: string;
  }) {
    return this.prisma.payment.create({
      data: { ...data, status: 'PENDING' } as any,
      include: { user: { select: { id: true, email: true } }, reservation: true },
    });
  }

  async confirmManual(paymentId: string, confirmedBy: string, reference?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID', paidAt: new Date(), confirmedBy, reference },
    });

    if (payment.reservationId) {
      await this.prisma.reservation.update({
        where: { id: payment.reservationId },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
    }

    if (payment.tournamentRegistrationId) {
      await this.prisma.tournamentRegistration.update({
        where: { id: payment.tournamentRegistrationId },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
    }

    return updated;
  }

  async refund(paymentId: string) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: { reservation: true, club: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
