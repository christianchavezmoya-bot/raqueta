import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RankingSeasonStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../../common/utils/club-scope';
import { StartSeasonDto } from './dto/start-season.dto';

const PROMOTE_COUNT = 3; // top N move up
const RELEGATE_COUNT = 3; // bottom N move down

@Injectable()
export class SeasonsService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async listSeasons(clubId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    return this.prisma.rankingSeason.findMany({
      where: { clubId },
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { rankingEntries: true, matchResults: true } } },
    });
  }

  async getSeasonStandings(clubId: string, seasonId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const season = await this.getSeason(clubId, seasonId);
    const entries = await this.fetchRankingEntries(clubId, seasonId);
    return { season, entries };
  }

  // ─── START SEASON (Part D) ───────────────────────────────────────────────────

  async startSeason(clubId: string, dto: StartSeasonDto, actor: ActingUser) {
    await this.assertScope(clubId, actor);

    // Only one active season per club
    const active = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: RankingSeasonStatus.ACTIVE },
    });
    if (active) {
      throw new BadRequestException(
        `Season "${active.label}" is still active. Close it before starting a new one.`,
      );
    }

    // Upsert division configs if provided
    if (dto.divisions?.length) {
      for (const div of dto.divisions) {
        await this.prisma.clubDivisionConfig.upsert({
          where: { clubId_divisionKey: { clubId, divisionKey: div.divisionKey.toUpperCase() } },
          update: { label: div.label, tierBasePoints: div.tierBasePoints, displayOrder: div.displayOrder },
          create: {
            clubId,
            divisionKey:    div.divisionKey.toUpperCase(),
            label:          div.label,
            tierBasePoints: div.tierBasePoints,
            displayOrder:   div.displayOrder,
          },
        });
      }
    }

    const season = await this.prisma.rankingSeason.create({
      data: {
        clubId,
        label:                   dto.label.trim(),
        startedAt:               new Date(),
        status:                  RankingSeasonStatus.ACTIVE,
        carryForwardDecayPercent: dto.carryForwardDecayPercent,
      },
    });

    // Seed starting points from the most recent closed season (if any)
    const prevSeason = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: RankingSeasonStatus.CLOSED },
      orderBy: { closedAt: 'desc' },
    });

    const divisionConfigs = await this.prisma.clubDivisionConfig.findMany({ where: { clubId } });
    const divBasePoints = new Map(divisionConfigs.map(d => [d.divisionKey, d.tierBasePoints]));

    // Get all roster members
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId },
      select: { id: true, division: true },
    });

    const seedPoints = new Map<string, number>();
    if (prevSeason) {
      const prevEntries = await this.prisma.clubRankingEntry.findMany({
        where: { clubId, seasonId: prevSeason.id },
        select: { rosterId: true, totalPoints: true },
      });
      for (const e of prevEntries) {
        const carried = Math.floor(e.totalPoints * dto.carryForwardDecayPercent / 100);
        seedPoints.set(e.rosterId, carried);
      }
    }

    // Create initial ClubRankingEntry rows for all roster members
    if (rosterEntries.length) {
      await this.prisma.clubRankingEntry.createMany({
        data: rosterEntries.map((r, idx) => {
          const divKey = r.division?.toUpperCase();
          const base = divKey ? (divBasePoints.get(divKey) ?? 0) : 0;
          const carried = seedPoints.get(r.id) ?? 0;
          return {
            clubId,
            seasonId:    season.id,
            rosterId:    r.id,
            rank:        idx + 1,
            totalPoints: carried + base,
            gamesPlayed: 0,
            withdrawn:   false,
            division:    r.division,
          };
        }),
        skipDuplicates: true,
      });
    }

    return { season, seededPlayers: rosterEntries.length };
  }

  // ─── CLOSE SEASON (Part D) ───────────────────────────────────────────────────

  async closeSeason(clubId: string, seasonId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const season = await this.getSeason(clubId, seasonId);
    if (season.status !== RankingSeasonStatus.ACTIVE) {
      throw new BadRequestException('Season is already closed');
    }

    // Freeze final standings
    await this.prisma.rankingSeason.update({
      where: { id: seasonId },
      data: { status: RankingSeasonStatus.CLOSED, closedAt: new Date() },
    });

    // Promotion / relegation
    const divisionConfigs = await this.prisma.clubDivisionConfig.findMany({
      where: { clubId },
      orderBy: { displayOrder: 'asc' },
    });

    const promotionLog: Array<{ rosterId: string; from: string; to: string }> = [];
    const relegationLog: Array<{ rosterId: string; from: string; to: string }> = [];

    if (divisionConfigs.length >= 2) {
      const entries = await this.fetchRankingEntries(clubId, seasonId);

      // Group by division
      const byDiv = new Map<string, typeof entries>();
      for (const e of entries) {
        if (!e.division) continue;
        const list = byDiv.get(e.division) ?? [];
        list.push(e);
        byDiv.set(e.division, list);
      }

      for (let divIdx = 0; divIdx < divisionConfigs.length; divIdx++) {
        const div = divisionConfigs[divIdx];
        const divEntries = byDiv.get(div.divisionKey) ?? [];
        divEntries.sort((a, b) => a.rank - b.rank);

        const isTop    = divIdx === 0;
        const isBottom = divIdx === divisionConfigs.length - 1;
        const upperDiv = isTop    ? null : divisionConfigs[divIdx - 1];
        const lowerDiv = isBottom ? null : divisionConfigs[divIdx + 1];

        // Promote top N (except top division)
        if (!isTop && upperDiv) {
          const promotees = divEntries.slice(0, PROMOTE_COUNT);
          for (const e of promotees) {
            await this.prisma.clubPlayerRoster.update({
              where: { id: e.rosterId },
              data: { division: upperDiv.divisionKey },
            });
            promotionLog.push({ rosterId: e.rosterId, from: div.divisionKey, to: upperDiv.divisionKey });
          }
        }

        // Relegate bottom N (except bottom division)
        if (!isBottom && lowerDiv && divEntries.length > RELEGATE_COUNT) {
          const relegees = divEntries.slice(-RELEGATE_COUNT);
          for (const e of relegees) {
            await this.prisma.clubPlayerRoster.update({
              where: { id: e.rosterId },
              data: { division: lowerDiv.divisionKey },
            });
            relegationLog.push({ rosterId: e.rosterId, from: div.divisionKey, to: lowerDiv.divisionKey });
          }
        }
      }
    }

    const finalStandings = await this.fetchRankingEntries(clubId, seasonId);
    return {
      season: await this.prisma.rankingSeason.findUnique({ where: { id: seasonId } }),
      finalStandings,
      promotionLog,
      relegationLog,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async fetchRankingEntries(clubId: string, seasonId: string) {
    return this.prisma.clubRankingEntry.findMany({
      where: { clubId, seasonId },
      include: {
        rosterEntry: {
          include: {
            linkedPlayerProfile: {
              select: { displayName: true, profilePhotoUrl: true },
            },
          },
        },
      },
      orderBy: [{ rank: 'asc' }],
    });
  }

  private async getSeason(clubId: string, seasonId: string) {
    const season = await this.prisma.rankingSeason.findUnique({ where: { id: seasonId } });
    if (!season || season.clubId !== clubId) throw new NotFoundException('Season not found');
    return season;
  }

  private async assertScope(clubId: string, actor: ActingUser) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
    await assertClubScope(actor, clubId, this.prisma);
  }
}
