import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getUserCalendar(userId: string, from?: Date, to?: Date) {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [reservations, matches, tournaments] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId, startTime: { gte: start, lte: end } },
        include: { court: true, club: { include: { profile: true } } },
      }),
      this.prisma.match.findMany({
        where: {
          OR: [{ playerOneId: userId }, { playerTwoId: userId }],
          scheduledTime: { gte: start, lte: end },
        },
        include: {
          playerOne: { select: { id: true, playerProfile: true } },
          playerTwo: { select: { id: true, playerProfile: true } },
          court: true,
          tournament: true,
        },
      }),
      this.prisma.tournament.findMany({
        where: {
          registrations: { some: { playerId: userId } },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        include: { club: { include: { profile: true } } },
      }),
    ]);

    return {
      reservations: reservations.map(r => ({ ...r, type: 'RESERVATION' })),
      matches: matches.map(m => ({ ...m, type: 'MATCH' })),
      tournaments: tournaments.map(t => ({ ...t, type: 'TOURNAMENT' })),
    };
  }

  async getClubCalendar(clubId: string, date?: Date) {
    const day = date ?? new Date();
    const start = new Date(day.setHours(0, 0, 0, 0));
    const end = new Date(day.setHours(23, 59, 59, 999));

    const [reservations, matches, blocks] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { clubId, startTime: { gte: start, lte: end } },
        include: {
          court: true,
          user: { select: { id: true, email: true, playerProfile: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.match.findMany({
        where: {
          tournament: { clubId },
          scheduledTime: { gte: start, lte: end },
        },
        include: {
          playerOne: { select: { id: true, playerProfile: true } },
          playerTwo: { select: { id: true, playerProfile: true } },
          court: true,
        },
        orderBy: { scheduledTime: 'asc' },
      }),
      this.prisma.courtBlock.findMany({
        where: {
          court: { clubId },
          startTime: { lte: end },
          endTime: { gte: start },
        },
        include: { court: true },
      }),
    ]);

    return { reservations, matches, blocks, date: start };
  }
}
