import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RankingsService {
  constructor(private prisma: PrismaService) {}

  async findByClub(clubId: string, category?: string, season?: string) {
    const currentSeason = season ?? new Date().getFullYear().toString();
    const where: any = { clubId, season: currentSeason };
    if (category) where.category = category;

    const rankings = await this.prisma.ranking.findMany({
      where,
      include: {
        player: { select: { id: true, email: true, playerProfile: { include: { stats: true } } } },
      },
      orderBy: { points: 'desc' },
    });

    return rankings.map((r, i) => ({ ...r, position: i + 1 }));
  }

  async getPlayerHistory(playerId: string) {
    return this.prisma.ranking.findMany({
      where: { playerId },
      include: { club: { include: { profile: true } } },
      orderBy: [{ season: 'desc' }, { points: 'desc' }],
    });
  }

  async recalculate(clubId: string, season?: string) {
    const currentSeason = season ?? new Date().getFullYear().toString();
    const rankings = await this.prisma.ranking.findMany({
      where: { clubId, season: currentSeason },
      orderBy: { points: 'desc' },
    });

    const updates = rankings.map((r, i) =>
      this.prisma.ranking.update({
        where: { id: r.id },
        data: { rank: i + 1 },
      }),
    );

    await Promise.all(updates);
    return this.findByClub(clubId, undefined, currentSeason);
  }
}
