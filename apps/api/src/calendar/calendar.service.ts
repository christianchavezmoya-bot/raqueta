import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getUserCalendar(userId: string, from?: Date, to?: Date) {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Resolve the user's linked roster entries (one profile could be linked to many clubs).
    const linkedRoster = await this.prisma.clubPlayerRoster.findMany({
      where: { linkedPlayerProfile: { userId } },
      select: { id: true },
    });
    const rosterIds = linkedRoster.map(r => r.id);

    const [reservations, matches, tournaments, teamRegistrations] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId, startTime: { gte: start, lte: end } },
        include: { court: true, club: { include: { profile: true } } },
      }),
      this.prisma.match.findMany({
        where: {
          OR: [
            { playerOneRosterId: { in: rosterIds } },
            { playerTwoRosterId: { in: rosterIds } },
            { teamOne: { OR: [{ player1RosterId: { in: rosterIds } }, { player2RosterId: { in: rosterIds } }] } },
            { teamTwo: { OR: [{ player1RosterId: { in: rosterIds } }, { player2RosterId: { in: rosterIds } }] } },
          ],
          scheduledTime: { gte: start, lte: end },
        },
        include: {
          playerOneRoster: { include: { linkedPlayerProfile: true } },
          playerTwoRoster: { include: { linkedPlayerProfile: true } },
          teamOne: { include: { player1Roster: { include: { linkedPlayerProfile: true } }, player2Roster: { include: { linkedPlayerProfile: true } } } },
          teamTwo: { include: { player1Roster: { include: { linkedPlayerProfile: true } }, player2Roster: { include: { linkedPlayerProfile: true } } } },
          court: true,
          tournament: true,
        },
      }),
      this.prisma.tournament.findMany({
        where: {
          OR: [
            { registrations: { some: { registeredByUserId: userId } } },
            ...(rosterIds.length
              ? [{ registrations: { some: { rosterId: { in: rosterIds } } } }]
              : []),
          ],
          startDate: { lte: end },
          endDate: { gte: start },
        },
        include: { club: { include: { profile: true } } },
      }),
      // Teams where this user is one of the two roster members (doubles)
      this.prisma.tournamentTeam.findMany({
        where: {
          OR: [
            { player1Roster: { linkedPlayerProfile: { userId } } },
            { player2Roster: { linkedPlayerProfile: { userId } } },
          ],
          tournament: {
            startDate: { lte: end },
            endDate: { gte: start },
          },
        },
        include: { tournament: { include: { club: { include: { profile: true } } } } },
      }),
    ]);

    // Add a synthetic tournament entry for each team so the user sees their
    // doubles commitments in the calendar too.
    const teamTournaments = teamRegistrations.map(t => t.tournament);

    return {
      reservations: reservations.map(r => ({ ...r, type: 'RESERVATION' })),
      matches: matches.map(m => ({ ...m, type: 'MATCH' })),
      tournaments: [...tournaments, ...teamTournaments].map(t => ({ ...t, type: 'TOURNAMENT' })),
    };
  }

  async getClubWeekCalendar(clubId: string, from?: Date, to?: Date) {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

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
        where: { tournament: { clubId }, scheduledTime: { gte: start, lte: end } },
        include: {
          playerOneRoster: { include: { linkedPlayerProfile: true } },
          playerTwoRoster: { include: { linkedPlayerProfile: true } },
          teamOne: { include: { player1Roster: true, player2Roster: true } },
          teamTwo: { include: { player1Roster: true, player2Roster: true } },
          court: true,
        },
        orderBy: { scheduledTime: 'asc' },
      }),
      this.prisma.courtBlock.findMany({
        where: { court: { clubId }, startTime: { lte: end }, endTime: { gte: start } },
        include: { court: true },
      }),
    ]);

    return { reservations, matches, blocks };
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
          playerOneRoster: { include: { linkedPlayerProfile: true } },
          playerTwoRoster: { include: { linkedPlayerProfile: true } },
          teamOne: { include: { player1Roster: true, player2Roster: true } },
          teamTwo: { include: { player1Roster: true, player2Roster: true } },
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
