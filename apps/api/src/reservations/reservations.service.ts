import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubsService } from '../clubs/clubs.service';
import { CourtsService } from '../courts/courts.service';
import { MembershipsService } from '../memberships/memberships.service';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private clubsService: ClubsService,
    private courtsService: CourtsService,
    private membershipsService: MembershipsService,
  ) {}

  async getAvailability(clubId: string, courtId: string, date: Date) {
    const slots = this.generateTimeSlots(date);
    const existing = await this.prisma.reservation.findMany({
      where: {
        courtId,
        startTime: { gte: new Date(date.setHours(0, 0, 0, 0)) },
        endTime: { lte: new Date(date.setHours(23, 59, 59, 999)) },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      },
    });

    const blocks = await this.prisma.courtBlock.findMany({
      where: {
        courtId,
        startTime: { lte: new Date(date.setHours(23, 59, 59, 999)) },
        endTime: { gte: new Date(date.setHours(0, 0, 0, 0)) },
      },
    });

    return slots.map(slot => {
      const slotStart = slot.start;
      const slotEnd = slot.end;
      const isReserved = existing.some(r => r.startTime < slotEnd && r.endTime > slotStart);
      const isBlocked = blocks.some(b => b.startTime < slotEnd && b.endTime > slotStart);
      const isOpen = this.clubsService.isOpenAt(clubId, slotStart);
      return { ...slot, available: !isReserved && !isBlocked, isReserved, isBlocked };
    });
  }

  async create(data: {
    clubId: string;
    courtId: string;
    userId: string;
    startTime: Date;
    endTime: Date;
    createdBy: string;
    notes?: string;
  }) {
    await this.validateSlot(data.courtId, data.clubId, data.startTime, data.endTime);

    const isMember = await this.membershipsService.isMember(data.userId, data.clubId);
    const court = await this.courtsService.findOne(data.courtId);
    const pricingKey = isMember ? 'MEMBER' : 'CASUAL';
    const pricing = court.pricing.find(p => p.userType === pricingKey) ?? court.pricing[0];
    const durationHours = (data.endTime.getTime() - data.startTime.getTime()) / 3600000;
    const price = pricing ? pricing.price * durationHours : 0;

    return this.prisma.reservation.create({
      data: {
        ...data,
        price,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
      },
      include: { court: true, user: { select: { id: true, email: true, playerProfile: true } } },
    });
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.reservation.findMany({
        skip,
        take: limit,
        where: { userId },
        include: { court: true, club: { include: { profile: true } } },
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.reservation.count({ where: { userId } }),
    ]);
    return { data, total, page, limit };
  }

  async findByClub(clubId: string, filters?: { date?: Date; status?: string }) {
    const where: any = { clubId };
    if (filters?.status) where.status = filters.status;
    if (filters?.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.startTime = { gte: start, lte: end };
    }
    return this.prisma.reservation.findMany({
      where,
      include: {
        court: true,
        user: { select: { id: true, email: true, playerProfile: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async cancel(reservationId: string, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    });
  }

  async checkIn(reservationId: string) {
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CONFIRMED' },
    });
  }

  async complete(reservationId: string) {
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'COMPLETED' },
    });
  }

  async markNoShow(reservationId: string) {
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'NO_SHOW' },
    });
  }

  private async validateSlot(courtId: string, clubId: string, start: Date, end: Date) {
    if (start >= end) throw new BadRequestException('Invalid time range');

    const isBlocked = await this.courtsService.isBlocked(courtId, start, end);
    if (isBlocked) throw new BadRequestException('Court is blocked during this time');

    const isOpen = await this.clubsService.isOpenAt(clubId, start);
    if (!isOpen) throw new BadRequestException('Club is not open during this time');

    const conflict = await this.prisma.reservation.findFirst({
      where: {
        courtId,
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflict) throw new BadRequestException('Court is already reserved for this time');
  }

  private generateTimeSlots(date: Date) {
    const slots = [];
    const d = new Date(date);
    d.setHours(7, 0, 0, 0);
    while (d.getHours() < 22) {
      const start = new Date(d);
      d.setMinutes(d.getMinutes() + 60);
      const end = new Date(d);
      slots.push({ start, end, label: `${start.getHours().toString().padStart(2, '0')}:00` });
    }
    return slots;
  }
}
