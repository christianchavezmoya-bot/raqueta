import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const POINTS = {
  win: 3,
  loss: 1,
  champion: 10,
  finalist: 6,
  semifinalist: 3,
};

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        playerOneRoster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            linkedPlayerProfile: { select: { id: true, displayName: true, profilePhotoUrl: true } },
          },
        },
        playerTwoRoster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            linkedPlayerProfile: { select: { id: true, displayName: true, profilePhotoUrl: true } },
          },
        },
        winnerRoster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            linkedPlayerProfile: { select: { id: true, displayName: true, profilePhotoUrl: true } },
          },
        },
        teamOne: { include: { player1Roster: true, player2Roster: true } },
        teamTwo: { include: { player1Roster: true, player2Roster: true } },
        teamWinner: { include: { player1Roster: true, player2Roster: true } },
        court: true,
        tournament: true,
        category: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async update(id: string, data: any) {
    return this.prisma.match.update({ where: { id }, data });
  }

  async recordResult(
    id: string,
    data: {
      playerOneScore?: string;
      playerTwoScore?: string;
      winnerRosterId?: string;
      teamWinnerId?: string;
    },
  ) {
    const match = await this.prisma.match.findUnique({ where: { id } });
    if (!match) throw new NotFoundException('Match not found');

    // Dispatch singles vs doubles path
    if (match.teamOneId || match.teamTwoId) {
      if (!data.teamWinnerId) {
        throw new BadRequestException('teamWinnerId is required for a doubles match');
      }
      const updated = await this.prisma.match.update({
        where: { id },
        data: {
          playerOneScore: data.playerOneScore,
          playerTwoScore: data.playerTwoScore,
          teamWinnerId: data.teamWinnerId,
          status: 'COMPLETED',
          recordedAt: new Date(),
        },
      });
      return updated;
    }

    if (!data.winnerRosterId) {
      throw new BadRequestException('winnerRosterId is required for a singles match');
    }

    const updated = await this.prisma.match.update({
      where: { id },
      data: {
        playerOneScore: data.playerOneScore,
        playerTwoScore: data.playerTwoScore,
        winnerRosterId: data.winnerRosterId,
        status: 'COMPLETED',
        recordedAt: new Date(),
      },
    });

    const loserRosterId =
      data.winnerRosterId === match.playerOneRosterId ? match.playerTwoRosterId : match.playerOneRosterId;

    await this.updateStats(data.winnerRosterId, loserRosterId);

    if (match.tournamentId && match.categoryId && loserRosterId) {
      await this.updateRankingPoints(match.tournamentId, match.categoryId, data.winnerRosterId, loserRosterId);
    }

    return updated;
  }

  /**
   * Player-keyed query: looks up the user's linked roster entries (across all
   * clubs the user may belong to) and returns matches where they appear as a
   * contestant. Doubles involvement is resolved through the team relation.
   */
  async findByPlayer(userId: string) {
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({
      where: { linkedPlayerProfile: { userId } },
      select: { id: true },
    });
    const rosterIds = rosterEntries.map(r => r.id);

    const teamEntries = await this.prisma.tournamentTeam.findMany({
      where: { OR: [{ player1RosterId: { in: rosterIds } }, { player2RosterId: { in: rosterIds } }] },
      select: { id: true },
    });
    const teamIds = teamEntries.map(t => t.id);

    return this.prisma.match.findMany({
      where: {
        OR: [
          { playerOneRosterId: { in: rosterIds } },
          { playerTwoRosterId: { in: rosterIds } },
          { winnerRosterId: { in: rosterIds } },
          { teamOneId: { in: teamIds } },
          { teamTwoId: { in: teamIds } },
          { teamWinnerId: { in: teamIds } },
        ],
      },
      include: {
        playerOneRoster: { include: { linkedPlayerProfile: true } },
        playerTwoRoster: { include: { linkedPlayerProfile: true } },
        teamOne: { include: { player1Roster: true, player2Roster: true } },
        teamTwo: { include: { player1Roster: true, player2Roster: true } },
        tournament: true,
      },
      orderBy: { scheduledTime: 'desc' },
    });
  }

  private async updateStats(winnerRosterId: string, loserRosterId: string | null) {
    const [winnerRoster, loserRoster] = await Promise.all([
      this.prisma.clubPlayerRoster.findUnique({
        where: { id: winnerRosterId },
        select: { linkedPlayerProfile: { select: { id: true } } },
      }),
      loserRosterId
        ? this.prisma.clubPlayerRoster.findUnique({
            where: { id: loserRosterId },
            select: { linkedPlayerProfile: { select: { id: true } } },
          })
        : Promise.resolve(null),
    ]);

    const winnerProfile = winnerRoster?.linkedPlayerProfile;
    const loserProfile = loserRoster?.linkedPlayerProfile;

    if (winnerProfile) {
      await this.prisma.playerStats.upsert({
        where: { playerId: winnerProfile.id },
        update: { wins: { increment: 1 }, matchesPlayed: { increment: 1 } },
        create: { playerId: winnerProfile.id, wins: 1, matchesPlayed: 1 },
      });
    }

    if (loserProfile) {
      await this.prisma.playerStats.upsert({
        where: { playerId: loserProfile.id },
        update: { losses: { increment: 1 }, matchesPlayed: { increment: 1 } },
        create: { playerId: loserProfile.id, losses: 1, matchesPlayed: 1 },
      });
    }
  }

  private async updateRankingPoints(
    tournamentId: string,
    categoryId: string,
    winnerRosterId: string,
    loserRosterId: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return;

    const season = new Date(tournament.startDate).getFullYear().toString();

    await Promise.all([
      this.upsertRanking(tournament.clubId, winnerRosterId, categoryId, POINTS.win, season),
      this.upsertRanking(tournament.clubId, loserRosterId, categoryId, POINTS.loss, season),
    ]);
  }

  private async upsertRanking(
    clubId: string,
    rosterId: string,
    category: string,
    points: number,
    season: string,
  ) {
    // For Ranking we still need a User FK (legacy schema), so resolve from roster.
    const roster = await this.prisma.clubPlayerRoster.findUnique({
      where: { id: rosterId },
      select: { linkedPlayerProfile: { select: { userId: true } } },
    });
    const userId = roster?.linkedPlayerProfile?.userId;
    if (!userId) return;

    await this.prisma.ranking.upsert({
      where: { clubId_playerId_category_season: { clubId, playerId: userId, category, season } },
      update: { points: { increment: points } },
      create: { clubId, playerId: userId, category, points, season },
    });
  }
}
