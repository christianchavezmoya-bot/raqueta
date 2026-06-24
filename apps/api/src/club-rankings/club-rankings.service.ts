import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubMatchResultSource, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { UpsertClubRankingRulesDto } from './dto/upsert-club-ranking-rules.dto';
import { CreateClubMatchResultDto } from './dto/create-club-match-result.dto';

const DEFAULT_RULES = [
  { categoryKey: 'STRAIGHT_SETS', label: 'Straight sets win', winnerPoints: 100, loserPoints: -50, active: true },
  { categoryKey: 'TIEBREAK_DECIDER', label: 'Deciding-set tiebreak', winnerPoints: 100, loserPoints: 70, active: true },
] as const;

type ParsedImportRow = {
  rowNumber: number;
  winnerNameRaw: string;
  loserNameRaw: string;
  winnerEmail?: string;
  loserEmail?: string;
  categoryKey: string;
  recordedAt: Date;
  setScores?: Array<{ winner: number; loser: number }>;
};

@Injectable()
export class ClubRankingsService {
  constructor(private prisma: PrismaService) {}

  async getRules(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    await this.ensureRulesSeeded(clubId);
    return this.prisma.clubRankingRule.findMany({ where: { clubId }, orderBy: [{ active: 'desc' }, { categoryKey: 'asc' }] });
  }

  async updateRules(clubId: string, dto: UpsertClubRankingRulesDto, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    await this.ensureRulesSeeded(clubId);
    if (!dto.rules.length) throw new BadRequestException('At least one rule is required');

    const normalized = dto.rules.map(rule => ({
      ...rule,
      categoryKey: rule.categoryKey.trim().toUpperCase(),
      label: rule.label.trim(),
      active: rule.active ?? true,
    }));

    const duplicateKey = normalized.find((rule, index) => normalized.findIndex(item => item.categoryKey === rule.categoryKey) !== index);
    if (duplicateKey) throw new BadRequestException(`Duplicate categoryKey: ${duplicateKey.categoryKey}`);

    await this.prisma.$transaction(async tx => {
      for (const rule of normalized) {
        await tx.clubRankingRule.upsert({
          where: { clubId_categoryKey: { clubId, categoryKey: rule.categoryKey } },
          update: {
            label: rule.label,
            winnerPoints: rule.winnerPoints,
            loserPoints: rule.loserPoints,
            active: rule.active,
          },
          create: {
            clubId,
            categoryKey: rule.categoryKey,
            label: rule.label,
            winnerPoints: rule.winnerPoints,
            loserPoints: rule.loserPoints,
            active: rule.active,
          },
        });
      }
    });

    return this.getRules(clubId, actor);
  }

  async getClubPlayers(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    const players = await this.prisma.playerProfile.findMany({
      where: { homeClubId: clubId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { displayName: 'asc' },
    });

    return players.map(player => ({
      id: player.id,
      userId: player.userId,
      displayName: player.displayName,
      email: player.user.email,
    }));
  }

  async createMatchResult(clubId: string, dto: CreateClubMatchResultDto, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    await this.ensureCategoryExists(clubId, dto.categoryKey);

    const winnerPlayerId = dto.winnerPlayerId?.trim() || null;
    const loserPlayerId = dto.loserPlayerId?.trim() || null;
    if (winnerPlayerId && loserPlayerId && winnerPlayerId === loserPlayerId) {
      throw new BadRequestException('Winner and loser must be different players');
    }

    const result = await this.prisma.clubMatchResult.create({
      data: {
        clubId,
        winnerPlayerId,
        winnerNameRaw: dto.winnerNameRaw.trim(),
        loserPlayerId,
        loserNameRaw: dto.loserNameRaw.trim(),
        categoryKey: dto.categoryKey.trim().toUpperCase(),
        setScores: dto.setScores as unknown as Prisma.InputJsonValue | undefined,
        recordedAt: new Date(dto.recordedAt),
        source: ClubMatchResultSource.MANUAL,
        enteredByUserId: actor.id,
      },
    });

    const standings = await this.recalculateInternal(clubId);
    return { created: result, standings };
  }

  async importMatchResults(clubId: string, file: Express.Multer.File | undefined, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    if (!file) throw new BadRequestException('Upload a CSV or XLSX file');

    const rows = this.parseWorkbook(file.buffer);
    if (!rows.length) throw new BadRequestException('No rows were found in the uploaded file');

    const categoryKeys = new Set((await this.getRules(clubId, actor)).map(rule => rule.categoryKey));
    const clubPlayers = await this.prisma.playerProfile.findMany({
      where: { homeClubId: clubId },
      include: { user: { select: { email: true } } },
    });

    const byEmail = new Map(clubPlayers.map(player => [player.user.email.toLowerCase(), player]));
    const byName = new Map<string, typeof clubPlayers>();
    for (const player of clubPlayers) {
      const key = player.displayName.trim().toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(player);
      byName.set(key, list);
    }

    const invalidRows: Array<{ rowNumber: number; reason: string }> = [];
    const unmatchedPlayers = new Set<string>();
    const createData: Prisma.ClubMatchResultCreateManyInput[] = [];
    let matchedPlayers = 0;

    for (const row of rows) {
      if (!categoryKeys.has(row.categoryKey)) {
        invalidRows.push({ rowNumber: row.rowNumber, reason: `Unknown categoryKey ${row.categoryKey}` });
        continue;
      }

      const winner = this.resolveImportedPlayer(row.winnerEmail, row.winnerNameRaw, byEmail, byName);
      const loser = this.resolveImportedPlayer(row.loserEmail, row.loserNameRaw, byEmail, byName);

      if (winner.status === 'matched') matchedPlayers += 1;
      else unmatchedPlayers.add(row.winnerNameRaw);
      if (loser.status === 'matched') matchedPlayers += 1;
      else unmatchedPlayers.add(row.loserNameRaw);

      createData.push({
        clubId,
        winnerPlayerId: winner.status === 'matched' ? winner.player.id : null,
        winnerNameRaw: row.winnerNameRaw,
        loserPlayerId: loser.status === 'matched' ? loser.player.id : null,
        loserNameRaw: row.loserNameRaw,
        categoryKey: row.categoryKey,
        setScores: row.setScores as unknown as Prisma.InputJsonValue | undefined,
        recordedAt: row.recordedAt,
        source: ClubMatchResultSource.UPLOAD,
        enteredByUserId: actor.id,
      });
    }

    if (createData.length) {
      await this.prisma.clubMatchResult.createMany({ data: createData });
    }

    const standings = createData.length ? await this.recalculateInternal(clubId) : await this.getInternalRankings(clubId);
    return {
      processedRows: createData.length,
      invalidRows,
      matchedPlayers,
      unmatchedPlayers: Array.from(unmatchedPlayers).sort(),
      standings,
    };
  }

  async recalculate(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    return this.recalculateInternal(clubId);
  }

  async getInternalRankings(clubId: string) {
    await this.ensureClubExists(clubId);
    return this.prisma.clubRankingEntry.findMany({
      where: { clubId },
      include: {
        player: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
      orderBy: [{ rank: 'asc' }, { updatedAt: 'asc' }],
    });
  }

  private async recalculateInternal(clubId: string) {
    await this.ensureRulesSeeded(clubId);
    const [rules, results] = await Promise.all([
      this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } }),
      this.prisma.clubMatchResult.findMany({ where: { clubId }, orderBy: { recordedAt: 'asc' } }),
    ]);

    const ruleMap = new Map(rules.map(rule => [rule.categoryKey, rule]));
    const totals = new Map<string, { totalPoints: number; gamesPlayed: number }>();

    for (const result of results) {
      const rule = ruleMap.get(result.categoryKey);
      if (!rule) continue;

      if (result.winnerPlayerId) {
        const current = totals.get(result.winnerPlayerId) ?? { totalPoints: 0, gamesPlayed: 0 };
        current.totalPoints += rule.winnerPoints;
        current.gamesPlayed += 1;
        totals.set(result.winnerPlayerId, current);
      }

      if (result.loserPlayerId) {
        const current = totals.get(result.loserPlayerId) ?? { totalPoints: 0, gamesPlayed: 0 };
        current.totalPoints += rule.loserPoints;
        current.gamesPlayed += 1;
        totals.set(result.loserPlayerId, current);
      }
    }

    const ranked = Array.from(totals.entries())
      .map(([playerId, value]) => ({ playerId, ...value }))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed || a.playerId.localeCompare(b.playerId))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    await this.prisma.$transaction(async tx => {
      await tx.clubRankingEntry.deleteMany({ where: { clubId } });
      if (ranked.length) {
        await tx.clubRankingEntry.createMany({
          data: ranked.map(entry => ({
            clubId,
            playerId: entry.playerId,
            rank: entry.rank,
            totalPoints: entry.totalPoints,
            gamesPlayed: entry.gamesPlayed,
          })),
        });
      }
    });

    return this.getInternalRankings(clubId);
  }

  private parseWorkbook(buffer: Buffer): ParsedImportRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    return rows.map((row, index) => {
      const normalized = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
      const categoryKey = String(this.pick(normalized, ['categorykey', 'category_key', 'category']) ?? '').trim().toUpperCase();
      const winnerNameRaw = String(this.pick(normalized, ['winnernameraw', 'winner_name_raw', 'winner', 'winnername']) ?? '').trim();
      const loserNameRaw = String(this.pick(normalized, ['losernameraw', 'loser_name_raw', 'loser', 'losername']) ?? '').trim();
      const winnerEmail = String(this.pick(normalized, ['winneremail', 'winner_email']) ?? '').trim() || undefined;
      const loserEmail = String(this.pick(normalized, ['loseremail', 'loser_email']) ?? '').trim() || undefined;
      const recordedAtValue = this.pick(normalized, ['recordedat', 'recorded_at', 'date']);
      const recordedAt = recordedAtValue ? new Date(String(recordedAtValue)) : new Date();
      const setScoresValue = this.pick(normalized, ['setscores', 'set_scores', 'scores']);
      const setScores = this.parseSetScores(setScoresValue);

      if (!categoryKey || !winnerNameRaw || !loserNameRaw || Number.isNaN(recordedAt.getTime())) {
        throw new BadRequestException(`Row ${index + 2} is missing winner, loser, categoryKey, or a valid date`);
      }

      return {
        rowNumber: index + 2,
        winnerNameRaw,
        loserNameRaw,
        winnerEmail,
        loserEmail,
        categoryKey,
        recordedAt,
        setScores,
      };
    });
  }

  private parseSetScores(value: unknown) {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;

    try {
      if (raw.startsWith('[')) {
        return JSON.parse(raw) as Array<{ winner: number; loser: number }>;
      }
    } catch {
      return undefined;
    }

    const parsed = raw.split(/[,;]+/).map(part => part.trim()).filter(Boolean).map(set => {
      const match = set.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (!match) return null;
      return { winner: Number(match[1]), loser: Number(match[2]) };
    }).filter((item): item is { winner: number; loser: number } => Boolean(item));

    return parsed.length ? parsed : undefined;
  }

  private resolveImportedPlayer(
    email: string | undefined,
    name: string,
    byEmail: Map<string, any>,
    byName: Map<string, any[]>,
  ) {
    if (email) {
      const match = byEmail.get(email.toLowerCase());
      return match ? { status: 'matched' as const, player: match } : { status: 'unmatched' as const };
    }

    const candidates = byName.get(name.trim().toLowerCase()) ?? [];
    if (candidates.length === 1) return { status: 'matched' as const, player: candidates[0] };
    return { status: 'unmatched' as const };
  }

  private pick(map: Map<string, unknown>, keys: string[]) {
    for (const key of keys) {
      if (map.has(key)) return map.get(key);
    }
    return undefined;
  }

  private async ensureRulesSeeded(clubId: string) {
    await this.ensureClubExists(clubId);
    const count = await this.prisma.clubRankingRule.count({ where: { clubId } });
    if (count > 0) return;

    await this.prisma.clubRankingRule.createMany({
      data: DEFAULT_RULES.map(rule => ({ ...rule, clubId })),
    });
  }

  private async ensureCategoryExists(clubId: string, categoryKey: string) {
    const normalized = categoryKey.trim().toUpperCase();
    const rule = await this.prisma.clubRankingRule.findUnique({ where: { clubId_categoryKey: { clubId, categoryKey: normalized } } });
    if (!rule) throw new BadRequestException(`Unknown categoryKey ${normalized}`);
  }

  private async assertScopedClub(clubId: string, actor: ActingUser) {
    await this.ensureClubExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
  }

  private async ensureClubExists(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }
}
