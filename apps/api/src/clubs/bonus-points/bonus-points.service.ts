import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../../common/utils/club-scope';
import { AwardBonusDto } from './dto/award-bonus.dto';

@Injectable()
export class BonusPointsService {
  constructor(private prisma: PrismaService) {}

  async listBonusTypes(clubId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    return this.prisma.clubBonusPointType.findMany({
      where: { clubId },
      orderBy: { key: 'asc' },
    });
  }

  async awardBonus(clubId: string, dto: AwardBonusDto, actor: ActingUser) {
    await this.assertScope(clubId, actor);

    // Validate season
    const season = await this.prisma.rankingSeason.findUnique({ where: { id: dto.seasonId } });
    if (!season || season.clubId !== clubId) throw new NotFoundException('Season not found');
    if (season.status !== 'ACTIVE') throw new BadRequestException('Can only award bonuses in an active season');

    // Validate roster entry
    const roster = await this.prisma.clubPlayerRoster.findFirst({
      where: { id: dto.rosterId, clubId },
    });
    if (!roster) throw new NotFoundException('Roster entry not found');

    // Validate bonus type
    const bonusType = await this.prisma.clubBonusPointType.findFirst({
      where: { id: dto.bonusTypeId, clubId, active: true },
    });
    if (!bonusType) throw new NotFoundException('Bonus type not found or inactive');

    const award = await this.prisma.clubBonusPointAward.create({
      data: {
        clubId,
        seasonId:        dto.seasonId,
        rosterId:        dto.rosterId,
        bonusTypeId:     dto.bonusTypeId,
        awardedByUserId: actor.id,
        note:            dto.note,
      },
      include: {
        bonusType:    true,
        rosterEntry:  { select: { firstName: true, lastName: true } },
        awardedByUser: { select: { email: true } },
      },
    });

    // Reflect bonus in the season's ranking entry
    await this.prisma.clubRankingEntry.updateMany({
      where: { clubId, seasonId: dto.seasonId, rosterId: dto.rosterId },
      data:  { totalPoints: { increment: bonusType.points } },
    });

    // Re-sort ranks for this season
    await this.resortRanks(clubId, dto.seasonId);

    return award;
  }

  async listAwards(clubId: string, seasonId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const season = await this.prisma.rankingSeason.findUnique({ where: { id: seasonId } });
    if (!season || season.clubId !== clubId) throw new NotFoundException('Season not found');

    return this.prisma.clubBonusPointAward.findMany({
      where: { clubId, seasonId },
      include: {
        bonusType:     true,
        rosterEntry:   { select: { firstName: true, lastName: true } },
        awardedByUser: { select: { email: true } },
      },
      orderBy: { awardedAt: 'desc' },
    });
  }

  private async resortRanks(clubId: string, seasonId: string) {
    const entries = await this.prisma.clubRankingEntry.findMany({
      where: { clubId, seasonId },
      orderBy: [{ totalPoints: 'desc' }, { gamesPlayed: 'desc' }],
    });
    await this.prisma.$transaction(
      entries.map((e, idx) =>
        this.prisma.clubRankingEntry.update({
          where: { id: e.id },
          data:  { rank: idx + 1 },
        }),
      ),
    );
  }

  private async assertScope(clubId: string, actor: ActingUser) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
    await assertClubScope(actor, clubId, this.prisma);
  }
}
