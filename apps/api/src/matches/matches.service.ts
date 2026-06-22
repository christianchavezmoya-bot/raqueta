import { Injectable, NotFoundException } from '@nestjs/common';
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
        playerOne: { select: { id: true, email: true, playerProfile: true } },
        playerTwo: { select: { id: true, email: true, playerProfile: true } },
        winner: { select: { id: true, email: true, playerProfile: true } },
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

  async recordResult(id: string, data: { playerOneScore: string; playerTwoScore: string; winnerId: string }) {
    const match = await this.prisma.match.findUnique({ where: { id } });
    if (!match) throw new NotFoundException('Match not found');

    const updated = await this.prisma.match.update({
      where: { id },
      data: { ...data, status: 'COMPLETED' },
    });

    const loserId = data.winnerId === match.playerOneId ? match.playerTwoId : match.playerOneId;

    await this.updateStats(data.winnerId, loserId, match.tournamentId);

    if (match.tournamentId && match.categoryId) {
      await this.updateRankingPoints(match.tournamentId, match.categoryId, data.winnerId, loserId, match.round);
    }

    return updated;
  }

  async findByPlayer(playerId: string) {
    return this.prisma.match.findMany({
      where: { OR: [{ playerOneId: playerId }, { playerTwoId: playerId }] },
      include: {
        playerOne: { select: { id: true, email: true, playerProfile: true } },
        playerTwo: { select: { id: true, email: true, playerProfile: true } },
        tournament: true,
      },
      orderBy: { scheduledTime: 'desc' },
    });
  }

  private async updateStats(winnerId: string, loserId: string, tournamentId?: string) {
    const [winnerProfile, loserProfile] = await Promise.all([
      this.prisma.playerProfile.findFirst({ where: { userId: winnerId } }),
      this.prisma.playerProfile.findFirst({ where: { userId: loserId } }),
    ]);

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
    winnerId: string,
    loserId: string,
    round?: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return;

    const season = new Date(tournament.startDate).getFullYear().toString();

    await Promise.all([
      this.upsertRanking(tournament.clubId, winnerId, categoryId, POINTS.win, season),
      this.upsertRanking(tournament.clubId, loserId, categoryId, POINTS.loss, season),
    ]);
  }

  private async upsertRanking(clubId: string, userId: string, category: string, points: number, season: string) {
    await this.prisma.ranking.upsert({
      where: { clubId_playerId_category_season: { clubId, playerId: userId, category, season } },
      update: { points: { increment: points } },
      create: { clubId, playerId: userId, category, points, season },
    });
  }
}
