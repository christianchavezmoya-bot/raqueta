import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubMatchResultSource, Prisma, RankingSeasonStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { UpsertClubRankingRulesDto } from './dto/upsert-club-ranking-rules.dto';
import { CreateClubMatchResultDto } from './dto/create-club-match-result.dto';

const DEFAULT_RULES = [
  { categoryKey: 'STRAIGHT_SETS',   label: 'Straight sets win',        winnerPoints: 100, loserPoints: -50, active: true },
  { categoryKey: 'TIEBREAK_DECIDER', label: 'Deciding-set tiebreak',   winnerPoints: 100, loserPoints:  70, active: true },
  { categoryKey: 'RETIRO_LESION',   label: 'Retiro por lesión',        winnerPoints: 100, loserPoints:   0, active: true },
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

type GridImportRow = {
  rowPlayer: string;
  colPlayer: string;
  cellValue: string;
  rowNumber: number;
  colName: string;
};

@Injectable()
export class ClubRankingsService {
  constructor(private prisma: PrismaService) {}

  // ─── RULES ───────────────────────────────────────────────────────────────────

  async getRules(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    await this.ensureRulesSeeded(clubId);
    return this.prisma.clubRankingRule.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { categoryKey: 'asc' }],
    });
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

    const dup = normalized.find((r, i) => normalized.findIndex(x => x.categoryKey === r.categoryKey) !== i);
    if (dup) throw new BadRequestException(`Duplicate categoryKey: ${dup.categoryKey}`);

    await this.prisma.$transaction(async tx => {
      for (const rule of normalized) {
        await tx.clubRankingRule.upsert({
          where: { clubId_categoryKey: { clubId, categoryKey: rule.categoryKey } },
          update: { label: rule.label, winnerPoints: rule.winnerPoints, loserPoints: rule.loserPoints, active: rule.active },
          create: { clubId, ...rule },
        });
      }
    });
    return this.getRules(clubId, actor);
  }

  // ─── ROSTER LISTING (replaces getClubPlayers) ────────────────────────────────

  async getClubRosterForEntry(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    const entries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId },
      include: { linkedPlayerProfile: { select: { displayName: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return entries.map(e => ({
      id:          e.id,
      fullName:    `${e.firstName} ${e.lastName}`,
      division:    e.division,
      linked:      !!e.linkedPlayerProfileId,
      displayName: e.linkedPlayerProfile?.displayName,
    }));
  }

  // ─── CREATE MATCH RESULT (Part B) ────────────────────────────────────────────

  async createMatchResult(clubId: string, dto: CreateClubMatchResultDto, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    await this.ensureCategoryExists(clubId, dto.categoryKey);

    const winnerRosterId = dto.winnerRosterId?.trim() || null;
    const loserRosterId  = dto.loserRosterId?.trim()  || null;
    if (winnerRosterId && loserRosterId && winnerRosterId === loserRosterId) {
      throw new BadRequestException('Winner and loser must be different roster entries');
    }

    // Validate roster entries belong to this club
    if (winnerRosterId) await this.assertRosterBelongsToClub(clubId, winnerRosterId);
    if (loserRosterId)  await this.assertRosterBelongsToClub(clubId, loserRosterId);

    // Resolve active season if not specified
    const seasonId = dto.seasonId ?? (await this.getActiveSeasonId(clubId));

    const result = await this.prisma.clubMatchResult.create({
      data: {
        clubId,
        seasonId,
        winnerRosterId,
        winnerNameRaw: dto.winnerNameRaw.trim(),
        loserRosterId,
        loserNameRaw:  dto.loserNameRaw.trim(),
        categoryKey:   dto.categoryKey.trim().toUpperCase(),
        setScores:     dto.setScores as unknown as Prisma.InputJsonValue | undefined,
        recordedAt:    new Date(dto.recordedAt),
        source:        ClubMatchResultSource.MANUAL,
        enteredByUserId: actor.id,
      },
    });

    const standings = await this.recalculateInternal(clubId, seasonId ?? undefined);
    return { created: result, standings };
  }

  // ─── IMPORT (columnar CSV/XLSX) ───────────────────────────────────────────────

  async importMatchResults(clubId: string, file: Express.Multer.File | undefined, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    if (!file) throw new BadRequestException('Upload a CSV or XLSX file');

    const rows = this.parseWorkbook(file.buffer);
    if (!rows.length) throw new BadRequestException('No rows found in uploaded file');

    const categoryKeys = new Set((await this.getRules(clubId, actor)).map(r => r.categoryKey));
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId },
      include: { linkedPlayerProfile: { include: { user: { select: { email: true } } } } },
    });

    const byEmail = new Map<string, typeof rosterEntries[0]>();
    const byName  = new Map<string, typeof rosterEntries>();
    for (const e of rosterEntries) {
      const email = e.linkedPlayerProfile?.user?.email;
      if (email) byEmail.set(email.toLowerCase(), e);
      const key = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(e);
      byName.set(key, list);
    }

    const invalidRows: Array<{ rowNumber: number; reason: string }> = [];
    const unmatchedNames = new Set<string>();
    const createData: Prisma.ClubMatchResultCreateManyInput[] = [];
    let matchedCount = 0;

    const seasonId = await this.getActiveSeasonId(clubId);

    for (const row of rows) {
      if (!categoryKeys.has(row.categoryKey)) {
        invalidRows.push({ rowNumber: row.rowNumber, reason: `Unknown categoryKey: ${row.categoryKey}` });
        continue;
      }

      const winner = this.resolveRosterEntry(row.winnerEmail, row.winnerNameRaw, byEmail, byName);
      const loser  = this.resolveRosterEntry(row.loserEmail,  row.loserNameRaw,  byEmail, byName);

      if (winner.status === 'matched') matchedCount++;
      else unmatchedNames.add(row.winnerNameRaw);
      if (loser.status === 'matched') matchedCount++;
      else unmatchedNames.add(row.loserNameRaw);

      createData.push({
        clubId,
        seasonId,
        winnerRosterId: winner.status === 'matched' ? winner.entry.id : null,
        winnerNameRaw:  row.winnerNameRaw,
        loserRosterId:  loser.status === 'matched' ? loser.entry.id : null,
        loserNameRaw:   row.loserNameRaw,
        categoryKey:    row.categoryKey,
        setScores:      row.setScores as unknown as Prisma.InputJsonValue | undefined,
        recordedAt:     row.recordedAt,
        source:         ClubMatchResultSource.UPLOAD,
        enteredByUserId: actor.id,
      });
    }

    if (createData.length) await this.prisma.clubMatchResult.createMany({ data: createData });

    const standings = createData.length
      ? await this.recalculateInternal(clubId, seasonId ?? undefined)
      : await this.getInternalRankings(clubId);

    return {
      processedRows:    createData.length,
      invalidRows,
      matchedRosterEntries: matchedCount,
      unmatchedNames:   Array.from(unmatchedNames).sort(),
      standings,
    };
  }

  // ─── IMPORT GRID (Part C) ────────────────────────────────────────────────────

  async importMatchGrid(clubId: string, file: Express.Multer.File | undefined, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    if (!file) throw new BadRequestException('Upload a CSV or XLSX file');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];

    if (raw.length < 2) throw new BadRequestException('Grid must have at least a header row and one data row');

    const colHeaders = raw[0].map(h => String(h ?? '').trim()).filter(Boolean);
    if (!colHeaders.length) throw new BadRequestException('No column headers found in row 1');

    // Parse cells
    const gridRows: GridImportRow[] = [];
    for (let r = 1; r < raw.length; r++) {
      const row = raw[r];
      const rowPlayer = String(row[0] ?? '').trim();
      if (!rowPlayer) continue;

      for (let c = 1; c < colHeaders.length + 1; c++) {
        const colPlayer = colHeaders[c - 1];
        if (!colPlayer || colPlayer === rowPlayer) continue;
        const cell = String(row[c] ?? '').trim();
        if (!cell) continue;

        gridRows.push({
          rowPlayer,
          colPlayer,
          cellValue: cell,
          rowNumber: r + 1,
          colName: colPlayer,
        });
      }
    }

    if (!gridRows.length) throw new BadRequestException('No populated cells found in the grid');

    // Resolve roster entries by name
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({ where: { clubId } });
    const byName = new Map<string, typeof rosterEntries>();
    for (const e of rosterEntries) {
      const key = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(e);
      byName.set(key, list);
    }

    const unmatched: Array<{ name: string; rows: number[] }> = [];
    const ambiguous: Array<{ name: string; rows: number[]; candidates: string[] }> = [];
    const matched = new Map<string, string>();    // name → rosterId
    const createData: Prisma.ClubMatchResultCreateManyInput[] = [];

    const resolveByName = (name: string, rowNum: number): string | null => {
      if (matched.has(name)) return matched.get(name)!;
      const candidates = byName.get(name.toLowerCase()) ?? [];
      if (candidates.length === 1) {
        matched.set(name, candidates[0].id);
        return candidates[0].id;
      }
      if (candidates.length === 0) {
        const existing = unmatched.find(u => u.name === name);
        if (existing) existing.rows.push(rowNum);
        else unmatched.push({ name, rows: [rowNum] });
        return null;
      }
      // Ambiguous
      const existing = ambiguous.find(a => a.name === name);
      if (existing) existing.rows.push(rowNum);
      else ambiguous.push({
        name,
        rows:       [rowNum],
        candidates: candidates.map(c => `${c.firstName} ${c.lastName} (${c.id})`),
      });
      return null;
    };

    const seasonId = await this.getActiveSeasonId(clubId);

    // Grid convention: row player beat column player (row=winner, col=loser)
    for (const cell of gridRows) {
      const winnerRosterId = resolveByName(cell.rowPlayer, cell.rowNumber);
      const loserRosterId  = resolveByName(cell.colPlayer, cell.rowNumber);

      createData.push({
        clubId,
        seasonId,
        winnerRosterId,
        winnerNameRaw:   cell.rowPlayer,
        loserRosterId,
        loserNameRaw:    cell.colPlayer,
        categoryKey:     'STRAIGHT_SETS', // historical grid: use default; caller can specify via column override
        setScores:       this.parseSetScore(cell.cellValue),
        recordedAt:      new Date(),
        source:          ClubMatchResultSource.UPLOAD,
        enteredByUserId: actor.id,
      });
    }

    if (createData.length) await this.prisma.clubMatchResult.createMany({ data: createData });

    const standings = createData.length
      ? await this.recalculateInternal(clubId, seasonId ?? undefined)
      : await this.getInternalRankings(clubId);

    return {
      cellsProcessed: createData.length,
      unmatched,
      ambiguous,
      standings,
    };
  }

  // ─── RECALCULATE ─────────────────────────────────────────────────────────────

  async recalculate(clubId: string, actor: ActingUser) {
    await this.assertScopedClub(clubId, actor);
    const seasonId = await this.getActiveSeasonId(clubId);
    return this.recalculateInternal(clubId, seasonId ?? undefined);
  }

  async getInternalRankings(clubId: string, seasonId?: string) {
    await this.ensureClubExists(clubId);
    const resolvedSeason = seasonId ?? await this.getActiveSeasonId(clubId);
    return this.prisma.clubRankingEntry.findMany({
      where: { clubId, seasonId: resolvedSeason ?? undefined },
      include: {
        rosterEntry: {
          include: {
            linkedPlayerProfile: { select: { displayName: true, profilePhotoUrl: true } },
          },
        },
      },
      orderBy: [{ rank: 'asc' }, { updatedAt: 'asc' }],
    });
  }

  // ─── PRIVATE: RECALCULATE INTERNAL ───────────────────────────────────────────

  async recalculateInternal(clubId: string, seasonId?: string) {
    await this.ensureRulesSeeded(clubId);

    const [rules, results] = await Promise.all([
      this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } }),
      this.prisma.clubMatchResult.findMany({
        where: { clubId, seasonId: seasonId ?? null },
        orderBy: { recordedAt: 'asc' },
      }),
    ]);

    const ruleMap = new Map(rules.map(r => [r.categoryKey, r]));
    const totals  = new Map<string, { totalPoints: number; gamesPlayed: number }>();

    for (const result of results) {
      const rule = ruleMap.get(result.categoryKey);
      if (!rule) continue;

      if (result.winnerRosterId) {
        const cur = totals.get(result.winnerRosterId) ?? { totalPoints: 0, gamesPlayed: 0 };
        cur.totalPoints += rule.winnerPoints;
        cur.gamesPlayed += 1;
        totals.set(result.winnerRosterId, cur);
      }
      if (result.loserRosterId) {
        const cur = totals.get(result.loserRosterId) ?? { totalPoints: 0, gamesPlayed: 0 };
        cur.totalPoints += rule.loserPoints;
        cur.gamesPlayed += 1;
        totals.set(result.loserRosterId, cur);
      }
    }

    // Add bonus points for this season
    if (seasonId) {
      const bonusAwards = await this.prisma.clubBonusPointAward.findMany({
        where: { clubId, seasonId },
        include: { bonusType: true },
      });
      for (const award of bonusAwards) {
        const cur = totals.get(award.rosterId) ?? { totalPoints: 0, gamesPlayed: 0 };
        cur.totalPoints += award.bonusType.points;
        totals.set(award.rosterId, cur);
      }
    }

    const ranked = Array.from(totals.entries())
      .map(([rosterId, value]) => ({ rosterId, ...value }))
      .sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.gamesPlayed - a.gamesPlayed ||
        a.rosterId.localeCompare(b.rosterId),
      )
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    await this.prisma.$transaction(async tx => {
      // Delete entries for this season (or null-season) and recreate
      await tx.clubRankingEntry.deleteMany({
        where: { clubId, seasonId: seasonId ?? null },
      });
      if (ranked.length) {
        // Fetch division from roster entries
        const rosterDivisions = await tx.clubPlayerRoster.findMany({
          where: { id: { in: ranked.map(r => r.rosterId) } },
          select: { id: true, division: true },
        });
        const divMap = new Map(rosterDivisions.map(r => [r.id, r.division]));

        await tx.clubRankingEntry.createMany({
          data: ranked.map(entry => ({
            clubId,
            seasonId:    seasonId ?? null,
            rosterId:    entry.rosterId,
            rank:        entry.rank,
            totalPoints: entry.totalPoints,
            gamesPlayed: entry.gamesPlayed,
            division:    divMap.get(entry.rosterId) ?? null,
          })),
        });
      }
    });

    return this.getInternalRankings(clubId, seasonId);
  }

  // ─── PRIVATE: PARSING HELPERS ────────────────────────────────────────────────

  private parseWorkbook(buffer: Buffer): ParsedImportRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    return rows.map((row, index) => {
      const m = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const pick = (...keys: string[]) => {
        for (const k of keys) if (m.has(k)) return m.get(k);
        return undefined;
      };

      const categoryKey   = String(pick('categorykey', 'category_key', 'category') ?? '').trim().toUpperCase();
      const winnerNameRaw = String(pick('winnernameraw', 'winner_name_raw', 'winner', 'winnername') ?? '').trim();
      const loserNameRaw  = String(pick('losernameraw',  'loser_name_raw',  'loser',  'losername')  ?? '').trim();
      const winnerEmail   = String(pick('winneremail', 'winner_email') ?? '').trim() || undefined;
      const loserEmail    = String(pick('loseremail',  'loser_email')  ?? '').trim() || undefined;
      const recordedAtRaw = pick('recordedat', 'recorded_at', 'date');
      const recordedAt    = recordedAtRaw ? new Date(String(recordedAtRaw)) : new Date();
      const setScores     = this.parseSetScores(pick('setscores', 'set_scores', 'scores'));

      if (!categoryKey || !winnerNameRaw || !loserNameRaw || Number.isNaN(recordedAt.getTime())) {
        throw new BadRequestException(`Row ${index + 2} is missing required fields (winner, loser, categoryKey, date)`);
      }

      return { rowNumber: index + 2, winnerNameRaw, loserNameRaw, winnerEmail, loserEmail, categoryKey, recordedAt, setScores };
    });
  }

  private parseSetScores(value: unknown) {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;
    try {
      if (raw.startsWith('[')) return JSON.parse(raw) as Array<{ winner: number; loser: number }>;
    } catch { return undefined; }
    const parsed = raw.split(/[,;]+/).map(part => {
      const m = part.trim().match(/(\d+)\s*[-:]\s*(\d+)/);
      if (!m) return null;
      return { winner: Number(m[1]), loser: Number(m[2]) };
    }).filter((x): x is { winner: number; loser: number } => x !== null);
    return parsed.length ? parsed : undefined;
  }

  private parseSetScore(value: string): Prisma.InputJsonValue | undefined {
    const scores = this.parseSetScores(value);
    return scores as unknown as Prisma.InputJsonValue | undefined;
  }

  private resolveRosterEntry(
    email: string | undefined,
    name: string,
    byEmail: Map<string, any>,
    byName: Map<string, any[]>,
  ) {
    if (email) {
      const match = byEmail.get(email.toLowerCase());
      if (match) return { status: 'matched' as const, entry: match };
    }
    const candidates = byName.get(name.trim().toLowerCase()) ?? [];
    if (candidates.length === 1) return { status: 'matched' as const, entry: candidates[0] };
    return { status: 'unmatched' as const };
  }

  // ─── PRIVATE: HELPERS ────────────────────────────────────────────────────────

  private async getActiveSeasonId(clubId: string): Promise<string | null> {
    const season = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: RankingSeasonStatus.ACTIVE },
      select: { id: true },
    });
    return season?.id ?? null;
  }

  private async assertRosterBelongsToClub(clubId: string, rosterId: string) {
    const entry = await this.prisma.clubPlayerRoster.findFirst({ where: { id: rosterId, clubId } });
    if (!entry) throw new BadRequestException(`Roster entry ${rosterId} does not belong to this club`);
  }

  private async ensureRulesSeeded(clubId: string) {
    await this.ensureClubExists(clubId);
    const count = await this.prisma.clubRankingRule.count({ where: { clubId } });
    if (count > 0) return;
    await this.prisma.clubRankingRule.createMany({
      data: DEFAULT_RULES.map(r => ({ ...r, clubId })),
    });
  }

  private async ensureCategoryExists(clubId: string, categoryKey: string) {
    const normalized = categoryKey.trim().toUpperCase();
    const rule = await this.prisma.clubRankingRule.findUnique({
      where: { clubId_categoryKey: { clubId, categoryKey: normalized } },
    });
    if (!rule) throw new BadRequestException(`Unknown categoryKey: ${normalized}`);
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
