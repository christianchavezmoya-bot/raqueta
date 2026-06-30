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

  async importMatchResults(
    clubId: string,
    file: Express.Multer.File | undefined,
    actor: ActingUser,
    options: { seasonId?: string } = {},
  ) {
    await this.assertScopedClub(clubId, actor);
    if (!file) throw new BadRequestException('Upload a CSV or XLSX file');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });

    // ─── 1. (optional) Upsert ranking rules from the Configuración tab
    const rulesUpsert = await this.upsertRulesFromTab(wb, clubId);

    // ─── 2. Resolve which season these matches belong to
    const seasonId = options.seasonId ?? (await this.getActiveSeasonId(clubId));

    // ─── 3. Parse match rows from the first non-config sheet, OR fall back
    //     to the legacy shape (CSV-style flat xlsx with winner/loser headers).
    const targetSheet = this.pickResultadosSheet(wb);
    if (!targetSheet) throw new BadRequestException('No rows found in uploaded file');

    const rows = this.parseResultadosWorkbookSheet(targetSheet);
    if (!rows.length) throw new BadRequestException('No Resultados rows found in uploaded file');

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
      rulesUpserted:   rulesUpsert,
      targetSeasonId:   seasonId ?? null,
    };
  }

  // ─── PRIVATE: workbook helpers ───────────────────────────────────────────────

  /**
   * Look for a sheet called "Configuración" (or "Configuracion"), extract rule
   * rows, and upsert ClubRankingRule for the club. Also reads season carry-
   * forward decay if present. Returns a summary; never throws on parse issues.
   */
  private async upsertRulesFromTab(wb: XLSX.WorkBook, clubId: string) {
    const sheetName = wb.SheetNames.find(n => this.normalize(n) === 'configuracion');
    if (!sheetName) return { found: false, rulesUpserted: 0, seasonUpdated: false };

    const raw = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    let seasonUpdated = false;
    let rulesUpserted = 0;

    // Find the header row by header labels (whitespace/diacritics tolerant)
    const headerRowIdx = raw.findIndex(row =>
      Array.isArray(row) && row.some(v => {
        const n = this.normalize(v);
        return n === 'clavedecategoria' || n === 'categorykey' || n === 'clave_categoria';
      }),
    );
    if (headerRowIdx === -1) return { found: true, rulesUpserted: 0, seasonUpdated };

    // Header columns after normalization
    const headers = (raw[headerRowIdx] as unknown[]).map(v => this.normalize(v));

    for (let i = headerRowIdx + 1; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      if (!Array.isArray(row)) continue;
      // A row where every cell is empty is treated as a section divider:
      // stop walking the rule table there (the season-decay row sits below).
      const rowNonEmpty = (row as unknown[]).some(v => String(v ?? '').trim() !== '');
      if (!rowNonEmpty) break;

      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = String(row[j] ?? '').trim();
      }
      // Strip empty/diacritic headers
      const cleanCategory = obj['clavedecategoria'];
      if (!cleanCategory) continue;
      const label = obj['etiquetavisible'] || cleanCategory;
      const winnerRaw = obj['puntosalganador'];
      const loserRaw  = obj['puntosalperdedor'];
      if (winnerRaw === undefined || loserRaw === undefined) continue;
      const winnerPoints = Number(String(winnerRaw).replace(/[^-\d.]/g, ''));
      const loserPoints  = Number(String(loserRaw).replace(/[^-\d.]/g, ''));
      if (!Number.isFinite(winnerPoints) || !Number.isFinite(loserPoints)) continue;
      const activeRaw = obj['activa'] ?? 'SI';
      const active = !/^no$/i.test(activeRaw);

      const categoryKey = cleanCategory.toUpperCase();
      await this.prisma.clubRankingRule.upsert({
        where: { clubId_categoryKey: { clubId, categoryKey } },
        update: { label, winnerPoints, loserPoints, active },
        create: { clubId, categoryKey, label, winnerPoints, loserPoints, active },
      });
      rulesUpserted++;
    }

    // Carry-forward decay row: looks for a single-cell row labeled with the
    // decay header. Walking the whole sheet keeps this tolerant to row order.
    const activeSeason = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: RankingSeasonStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
    });
    for (const row of raw) {
      if (!Array.isArray(row)) continue;
      const first = String(row[0] ?? '').trim();
      if (this.normalize(first).startsWith('season carryforward decay') ||
          this.normalize(first).startsWith('season carry forward decay')) {
        const rawValue = row[1];
        const parsed = Number(String(rawValue ?? '').replace(/[^-\d.]/g, ''));
        if (Number.isFinite(parsed)) {
          if (activeSeason) {
            await this.prisma.rankingSeason.update({
              where: { id: activeSeason.id },
              data: { carryForwardDecayPercent: Math.round(parsed) },
            });
            seasonUpdated = true;
          }
        }
        break;
      }
    }

    return { found: true, rulesUpserted, seasonUpdated };
  }

  /**
   * Pick the sheet that holds Resultados rows. Honors a literal "Resultados"
   * tab when present (multi-tab template export). Falls back to the first
   * non-config / non-instructions sheet for legacy single-tab uploads.
   */
  private pickResultadosSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
    const exact = wb.SheetNames.find(n => this.normalize(n) === 'resultados');
    if (exact) return wb.Sheets[exact];
    const fallback = wb.SheetNames.find(n =>
      !['configuracion', 'miembros', 'liguilla', 'dobles', 'instrucciones'].includes(this.normalize(n)),
    );
    return fallback ? wb.Sheets[fallback] : wb.Sheets[wb.SheetNames[0]];
  }

  private normalize(input: unknown): string {
    return String(input ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Parse a Resultados-shaped sheet (row-per-match) into ParsedImportRows.
   * Mandatory columns (by header name): ganador, perdedor, tipoResultado,
   * fecha. Optional: sets. Extra columns are ignored.
   *
   * Uses header-1 sheet shape so leading instruction/comment rows can be
   * detected (they look like data rows when defval is applied).
   */
  private parseResultadosWorkbookSheet(sheet: XLSX.WorkSheet): ParsedImportRow[] {
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];
    const MANDATORY_LABELS = ['ganador', 'perdedor', 'tiporesultado', 'fecha'];

    // 1) Find the header row index by scanning for a row whose normalized cells
    //    contain the mandatory labels.
    let headerIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = (rawRows[i] ?? []).map(v => this.normalize(v));
      if (MANDATORY_LABELS.every(label => row.includes(label))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new BadRequestException(
        `Resultados sheet must contain a header row with at least: ${MANDATORY_LABELS.join(', ')}. None was found.`,
      );
    }

    const headers = (rawRows[headerIdx] ?? []).map(v => this.normalize(v));
    const col = (name: string) => headers.indexOf(name);
    const winnerIdx = col('ganador');
    const loserIdx  = col('perdedor');
    const typeIdx   = col('tiporesultado');
    const setsIdx   = col('sets');
    const dateIdx   = col('fecha');
    const winnerEmailIdx = col('winneremail') >= 0 ? col('winneremail') : col('winner_email');
    const loserEmailIdx  = col('loseremail')  >= 0 ? col('loseremail')  : col('loser_email');

    const parsed: ParsedImportRow[] = [];

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = (rawRows[i] ?? []) as string[];
      const cell = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
      const winnerNameRaw = cell(winnerIdx);
      const loserNameRaw  = cell(loserIdx);
      const categoryKey   = cell(typeIdx).toUpperCase();
      const setScores     = this.parseSetScores(cell(setsIdx));
      const dateStr       = cell(dateIdx);

      // Blank row → silently skip
      if (!categoryKey && !winnerNameRaw && !loserNameRaw) continue;
      const recordedAt = dateStr ? new Date(dateStr) : new Date(NaN);
      if (Number.isNaN(recordedAt.getTime())) {
        throw new BadRequestException(
          `Resultados row ${i + 2} is missing or has invalid date in 'fecha'`,
        );
      }

      parsed.push({
        rowNumber:     i + 2,
        winnerNameRaw,
        loserNameRaw,
        winnerEmail:   cell(winnerEmailIdx) || undefined,
        loserEmail:    cell(loserEmailIdx) || undefined,
        categoryKey,
        recordedAt,
        setScores,
      });
    }

    if (!parsed.length) {
      throw new BadRequestException('No Resultados rows found in uploaded file (no rows below the header)');
    }
    return parsed;
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
        cur.totalPoints += award.points;
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

  // ─── PUBLIC: PLAYER-FACING QUERY ENDPOINTS ───────────────────────────────────

  async getRankingBreakdown(clubId: string, rosterId: string, _actor: ActingUser) {
    await this.ensureClubExists(clubId);
    const seasonId = await this.getActiveSeasonId(clubId);

    const [matchWins, matchLosses, bonusAwards, rules] = await Promise.all([
      this.prisma.clubMatchResult.findMany({
        where: { clubId, seasonId: seasonId ?? undefined, winnerRosterId: rosterId },
      }),
      this.prisma.clubMatchResult.findMany({
        where: { clubId, seasonId: seasonId ?? undefined, loserRosterId: rosterId },
      }),
      this.prisma.clubBonusPointAward.findMany({
        where: { clubId, seasonId: seasonId ?? '', rosterId },
        include: { bonusType: true },
      }),
      this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } }),
    ]);

    const ruleMap = new Map(rules.map(r => [r.categoryKey, r]));

    let pr = 0;
    for (const m of matchWins)  pr += ruleMap.get(m.categoryKey)?.winnerPoints ?? 0;
    for (const m of matchLosses) pr += ruleMap.get(m.categoryKey)?.loserPoints ?? 0;

    let pe3 = 0, desafios = 0, penalizaciones = 0, otherBonos = 0;
    for (const award of bonusAwards) {
      const pts = award.points; // Stage 16 per-award override (falls back to bonusType.points via DB backfill)
      const key = award.bonusType.key.toUpperCase();
      if (key === 'PE3')      pe3 += pts;
      else if (key === 'DESAFIO') desafios += pts;
      else if (key === 'PENALTY') penalizaciones += pts;
      else otherBonos += pts;
    }

    return { pr, pe3, desafios, penalizaciones, otherBonos, total: pr + pe3 + desafios + penalizaciones + otherBonos };
  }

  async getMyCompetitiveMatches(clubId: string, seasonIdParam: string, actor: ActingUser) {
    await this.ensureClubExists(clubId);

    const seasonId = seasonIdParam === 'current'
      ? await this.getActiveSeasonId(clubId)
      : seasonIdParam;

    // Find the player's roster entry for this club
    const rosterEntry = await this.prisma.clubPlayerRoster.findFirst({
      where: {
        clubId,
        linkedPlayerProfile: { userId: actor.id },
      },
    });

    if (!rosterEntry) return [];

    const results = await this.prisma.clubMatchResult.findMany({
      where: {
        clubId,
        seasonId: seasonId ?? undefined,
        OR: [{ winnerRosterId: rosterEntry.id }, { loserRosterId: rosterEntry.id }],
      },
      include: {
        winnerRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
        loserRoster:  { include: { linkedPlayerProfile: { select: { displayName: true } } } },
      },
      orderBy: { recordedAt: 'desc' },
    });

    const rules = await this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } });
    const ruleMap = new Map(rules.map(r => [r.categoryKey, r]));

    return results.map(r => {
      const iWon = r.winnerRosterId === rosterEntry.id;
      const rule = ruleMap.get(r.categoryKey);
      const pointsAwarded = iWon ? (rule?.winnerPoints ?? 0) : (rule?.loserPoints ?? 0);
      const opponentRoster = iWon ? r.loserRoster : r.winnerRoster;
      const opponentName = opponentRoster?.linkedPlayerProfile?.displayName
        ?? (iWon ? r.loserNameRaw : r.winnerNameRaw);

      return {
        id: r.id,
        result: iWon ? 'WIN' : 'LOSS',
        opponentName,
        roundLabel: r.categoryKey,
        scoreLabel: null,
        sets: r.setScores as any,
        playedAt: r.recordedAt,
        pointsAwarded,
        source: r.source,
      };
    });
  }

  async getMyStats(clubId: string, actor: ActingUser) {
    await this.ensureClubExists(clubId);
    const matches = await this.getMyCompetitiveMatches(clubId, 'current', actor);

    const wins   = matches.filter(m => m.result === 'WIN').length;
    const losses = matches.filter(m => m.result === 'LOSS').length;
    const total  = matches.length;
    const winRate = total ? (wins / total) * 100 : 0;

    // Cumulative points evolution (running total chronologically)
    let running = 0;
    const pointsEvolution = [...matches].reverse().map((m, i) => {
      running += m.pointsAwarded;
      return { label: `R${i + 1}`, pts: running };
    });

    return { matchesPlayed: total, wins, losses, winRate, pointsEvolution };
  }

  async listMatchResults(
    clubId: string,
    opts: { source?: string; limit?: number },
    _actor: ActingUser,
  ) {
    await this.ensureClubExists(clubId);

    const results = await this.prisma.clubMatchResult.findMany({
      where: { clubId },
      include: {
        winnerRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
        loserRoster:  { include: { linkedPlayerProfile: { select: { displayName: true } } } },
      },
      orderBy: { recordedAt: 'desc' },
      take: opts.limit ?? 30,
    });

    const rules = await this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } });
    const ruleMap = new Map(rules.map(r => [r.categoryKey, r]));

    return results.map(r => {
      const rule = ruleMap.get(r.categoryKey);
      const p1Name = r.winnerRoster?.linkedPlayerProfile?.displayName ?? r.winnerNameRaw;
      const p2Name = r.loserRoster?.linkedPlayerProfile?.displayName  ?? r.loserNameRaw;

      return {
        id: r.id,
        player1Name: p1Name,
        player1Id: r.winnerRosterId,
        player2Name: p2Name,
        player2Id: r.loserRosterId,
        winnerId: r.winnerRosterId,
        roundLabel: r.categoryKey,
        sets: r.setScores,
        playedAt: r.recordedAt,
        pointsAwarded: rule?.winnerPoints ?? 0,
        source: r.source,
      };
    });
  }

  async getMatchResult(clubId: string, resultId: string, _actor: ActingUser) {
    await this.ensureClubExists(clubId);

    const r = await this.prisma.clubMatchResult.findFirst({
      where: { id: resultId, clubId },
      include: {
        winnerRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
        loserRoster:  { include: { linkedPlayerProfile: { select: { displayName: true } } } },
      },
    });
    if (!r) throw new NotFoundException('Match result not found');

    const rules = await this.prisma.clubRankingRule.findMany({ where: { clubId, active: true } });
    const ruleMap = new Map(rules.map(rule => [rule.categoryKey, rule]));
    const rule = ruleMap.get(r.categoryKey);

    return {
      id: r.id,
      player1Name: r.winnerRoster?.linkedPlayerProfile?.displayName ?? r.winnerNameRaw,
      player1Id: r.winnerRosterId,
      player2Name: r.loserRoster?.linkedPlayerProfile?.displayName ?? r.loserNameRaw,
      player2Id: r.loserRosterId,
      winnerId: r.winnerRosterId,
      roundLabel: r.categoryKey,
      sets: r.setScores as any,
      playedAt: r.recordedAt,
      pointsAwarded: rule?.winnerPoints ?? 0,
      pointsDeducted: Math.abs(rule?.loserPoints ?? 0),
      source: r.source,
    };
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
