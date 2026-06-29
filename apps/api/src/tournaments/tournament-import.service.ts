import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

/**
 * Historical tournament imports. Two flows:
 *
 *  - importLiguilla: row-per-match Liguilla (promotion / playoff) bracket data
 *    with stage + sub-bracket. We resolve every name to a roster entry,
 *    preserve WINNERS / LOSERS sub-bracket structure, and reject rows that
 *    can't be cleanly resolved.
 *
 *  - importDobles: row-per-match doubles round-robin data; we resolve two
 *    roster entries into a TournamentTeam (created on the fly) and persist
 *    matches + group standings.
 *
 * Both flows use the matched/unmatched-by-roster reporting pattern from the
 * Match Results importer in club-rankings.service.ts.
 */

interface ImportRow {
  rowNumber: number;
  raw: Record<string, unknown>;
}

export interface ResolvedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  matched: boolean;
  reason?: string;
}

type RosterIndexEntry = {
  id: string;
  firstName: string;
  lastName: string;
};

@Injectable()
export class TournamentImportService {
  constructor(private prisma: PrismaService) {}

  // ─── Liguilla (promotion / playoff bracket) ────────────────────────────────

  async importLiguilla(
    tournamentId: string,
    body: { rows: Array<Record<string, unknown>> },
    actor: ActingUser,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { club: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await assertClubScope(actor, tournament.clubId, this.prisma);

    const rawRows = body?.rows ?? [];
    if (!rawRows.length) throw new BadRequestException('No rows provided to import');

    const { byName, rosterEntries } = await this.loadRosterIndex(tournament.clubId);

    const stageKeys   = new Set(['MAIN', 'WINNERS', 'LOSERS']);
    const categoryByName = new Map(
      (
        await this.prisma.tournamentCategory.findMany({ where: { tournamentId } })
      ).map(c => [this.normalizeName(c.name), c]),
    );

    const resolved: ResolvedRow[] = [];
    const unmatchedNames = new Set<string>();
    let rejectedRows = 0;
    const candidatesToInsert: Array<{
      tournamentId: string;
      categoryId: string;
      round: string;
      bracketStage: 'MAIN' | 'WINNERS' | 'LOSERS';
      playerOneRosterId: string | null;
      playerTwoRosterId: string | null;
      winnerRosterId: string | null;
      playerOneScore: string | null;
      playerTwoScore: string | null;
      recordedAt: Date;
      notes: string | null;
      playerOneName: string;
      playerTwoName: string;
      winnerName: string;
    }> = [];

    let matchIndex = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const rowNumber = i + 2;

      const cells = this.normalizeRow(raw);

      const categoryName  = this.firstOf(cells, ['categoria', 'categoría', 'category']);
      const round         = this.firstOf(cells, ['ronda', 'round']) ?? null;
      const bracketStage  = this.firstOf(cells, ['etapa', 'bracketstage', 'stage']) ?? 'MAIN';
      const playerOneName = this.firstOf(cells, ['jugador1', 'playerone', 'jugador 1', 'player1']) ?? null;
      const playerTwoName = this.firstOf(cells, ['jugador2', 'playertwo', 'jugador 2', 'player2']) ?? null;
      const winnerName    = this.firstOf(cells, ['ganador', 'winner']) ?? null;
      const score         = this.firstOf(cells, ['sets', 'score', 'resultado']) ?? null;
      const fechaRaw      = this.firstOf(cells, ['fecha', 'date']);
      const placementRaw  = this.firstOf(cells, ['colocacion', 'colocación', 'placement', 'lugar']) ?? null;

      if (!categoryName || !round || !playerOneName || !playerTwoName) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: 'Missing mandatory field (categoria/ronda/jugador1/jugador2)' });
        continue;
      }

      const stageUpper = bracketStage.trim().toUpperCase();
      if (!stageKeys.has(stageUpper)) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: `Unknown bracketStage: ${bracketStage}` });
        continue;
      }

      const category = categoryByName.get(this.normalizeName(categoryName));
      if (!category) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: `Unknown categoria: ${categoryName}` });
        continue;
      }

      const p1 = this.resolveNameToRoster(playerOneName, byName, unmatchedNames);
      const p2 = this.resolveNameToRoster(playerTwoName, byName, unmatchedNames);
      if (!p1 || !p2) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: 'Unmatched player names' });
        continue;
      }

      const winnerRosterName = winnerName ?? (this.winnerFromScore(score) ?? null);
      const winnerRoster = winnerRosterName ? this.resolveNameToRoster(winnerRosterName, byName, unmatchedNames) : null;
      // Winner may be legitimately missing — that's okay, just record a
      // placement without setting winnerRosterId (the import preserves the
      // sub-bracket structure regardless).

      candidatesToInsert.push({
        tournamentId,
        categoryId: category.id,
        round,
        bracketStage: stageUpper as 'MAIN' | 'WINNERS' | 'LOSERS',
        playerOneRosterId: p1.id,
        playerTwoRosterId: p2.id,
        winnerRosterId: winnerRoster?.id ?? null,
        playerOneScore: this.parseScoreForSide(score, 0),
        playerTwoScore: this.parseScoreForSide(score, 1),
        recordedAt: this.parseDate(fechaRaw) ?? new Date(tournament.startDate),
        notes: placementRaw ? `colocación: ${placementRaw}` : null,
        playerOneName: `${p1.firstName} ${p1.lastName}`,
        playerTwoName: `${p2.firstName} ${p2.lastName}`,
        winnerName:    winnerRoster ? `${winnerRoster.firstName} ${winnerRoster.lastName}` : (winnerRosterName ?? ''),
      });

      resolved.push({ rowNumber, raw, matched: true });
      matchIndex++;
    }

    let inserted = 0;
    if (candidatesToInsert.length) {
      const data = candidatesToInsert.map(c => ({
        id: `match-import-${tournamentId}-${Date.now()}-${inserted + Math.random().toString(36).slice(2, 8)}`,
        tournamentId: c.tournamentId,
        categoryId: c.categoryId,
        round: c.round,
        bracketStage: c.bracketStage,
        playerOneRosterId: c.playerOneRosterId,
        playerTwoRosterId: c.playerTwoRosterId,
        winnerRosterId: c.winnerRosterId,
        playerOneScore: c.playerOneScore,
        playerTwoScore: c.playerTwoScore,
        recordedAt: c.recordedAt,
        notes: c.notes,
        status: 'COMPLETED' as const,
      }));
      const result = await this.prisma.match.createMany({ data, skipDuplicates: true });
      inserted = result.count;
    }

    return {
      tournamentId,
      processedRows: candidatesToInsert.length,
      insertedMatches: inserted,
      rejectedRows,
      resolved,
      unmatchedNames: Array.from(unmatchedNames).sort(),
      rosterEntriesAvailable: rosterEntries,
    };
  }

  // ─── Dobles (doubles round-robin) ──────────────────────────────────────────

  async importDobles(
    tournamentId: string,
    body: { rows: Array<Record<string, unknown>> },
    actor: ActingUser,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { club: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.format !== 'DOUBLES' && tournament.format !== 'MIXED') {
      throw new BadRequestException('Dobles import requires a tournament with DOUBLES or MIXED format');
    }
    await assertClubScope(actor, tournament.clubId, this.prisma);

    const rawRows = body?.rows ?? [];
    if (!rawRows.length) throw new BadRequestException('No rows provided to import');

    const { byName, rosterEntries } = await this.loadRosterIndex(tournament.clubId);
    const categoryByName = new Map(
      (
        await this.prisma.tournamentCategory.findMany({ where: { tournamentId } })
      ).map(c => [this.normalizeName(c.name), c]),
    );

    const resolved: ResolvedRow[] = [];
    const unmatchedNames = new Set<string>();
    let rejectedRows = 0;

    type TeamStub = { id: string; p1: RosterIndexEntry; p2: RosterIndexEntry; group: string | null; label: string };
    const teamCache = new Map<string, TeamStub>(); // key = normalized (p1Name|p2Name|group)

    const matchInserts: Array<{
      tournamentId: string;
      categoryId: string;
      round: string;
      bracketStage: 'MAIN';
      teamOneId: string;
      teamTwoId: string;
      teamWinnerId: string | null;
      playerOneScore: string | null;
      playerTwoScore: string | null;
      recordedAt: Date;
      group: string | null;
    }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const rowNumber = i + 2;
      const cells = this.normalizeRow(raw);

      const categoryName = this.firstOf(cells, ['categoria', 'categoría', 'category']);
      const group        = this.firstOf(cells, ['grupo', 'group']);
      const p1Name       = this.firstOf(cells, ['jugador1', 'player1', 'pareja1a', 'jugador 1']);
      const p2Name       = this.firstOf(cells, ['jugador2', 'player2', 'pareja1b', 'jugador 2']);
      const p3Name       = this.firstOf(cells, ['jugador3', 'player3', 'pareja2a', 'jugador 3']);
      const p4Name       = this.firstOf(cells, ['jugador4', 'player4', 'pareja2b', 'jugador 4']);
      const scoreRaw     = this.firstOf(cells, ['sets', 'score', 'resultado']);
      const winner       = this.firstOf(cells, ['ganador', 'winner']);
      const fechaRaw     = this.firstOf(cells, ['fecha', 'date']);

      if (!categoryName || !p1Name || !p2Name || !p3Name || !p4Name) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: 'Missing mandatory field (categoria/jugador1/jugador2/jugador3/jugador4)' });
        continue;
      }
      const category = categoryByName.get(this.normalizeName(categoryName));
      if (!category) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: `Unknown categoria: ${categoryName}` });
        continue;
      }

      const r1 = this.resolveNameToRoster(p1Name, byName, unmatchedNames);
      const r2 = this.resolveNameToRoster(p2Name, byName, unmatchedNames);
      const r3 = this.resolveNameToRoster(p3Name, byName, unmatchedNames);
      const r4 = this.resolveNameToRoster(p4Name, byName, unmatchedNames);
      if (!r1 || !r2 || !r3 || !r4) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: 'Unmatched player names' });
        continue;
      }

      const team1Key = this.teamKey(r1.id, r2.id, group);
      const team2Key = this.teamKey(r3.id, r4.id, group);

      // Reuse teams we've already created during this import so that the
      // "round-robin" standings aggregate correctly. Within a single import
      // each (p1|p2|group) pair is unique — that's the contract.
      const team1 = await this.upsertTeam(tournamentId, category.id, r1, r2, group ?? null, teamCache, team1Key);
      const team2 = await this.upsertTeam(tournamentId, category.id, r3, r4, group ?? null, teamCache, team2Key);

      if (team1.id === team2.id) {
        rejectedRows++;
        resolved.push({ rowNumber, raw, matched: false, reason: 'A team cannot play itself' });
        continue;
      }

      // Winner determination:
      //  - explicit winner column referring to team
      //  - else fall back to score parsing if it returns 1/2
      let teamWinnerId: string | null = null;
      if (winner) {
        const winLower = winner.trim().toLowerCase();
        if (winLower === '1' || winLower === 'equipo1' || winLower === 'team1') teamWinnerId = team1.id;
        else if (winLower === '2' || winLower === 'equipo2' || winLower === 'team2') teamWinnerId = team2.id;
        else if (this.normalizeName(winner) === this.normalizeName(`${r1.firstName} ${r1.lastName} ${r2.firstName} ${r2.lastName}`)) {
          teamWinnerId = team1.id;
        }
        else if (this.normalizeName(winner) === this.normalizeName(`${r3.firstName} ${r3.lastName} ${r4.firstName} ${r4.lastName}`)) {
          teamWinnerId = team2.id;
        }
      } else {
        const scoreHint = this.winnerFromScore(scoreRaw);
        if (scoreHint === '1') teamWinnerId = team1.id;
        else if (scoreHint === '2') teamWinnerId = team2.id;
      }

      matchInserts.push({
        tournamentId,
        categoryId: category.id,
        round: 'GRUPO',
        bracketStage: 'MAIN',
        teamOneId: team1.id,
        teamTwoId: team2.id,
        teamWinnerId,
        playerOneScore: this.parseScoreForSide(scoreRaw, 0),
        playerTwoScore: this.parseScoreForSide(scoreRaw, 1),
        recordedAt: this.parseDate(fechaRaw) ?? new Date(tournament.startDate),
        group: group ?? null,
      });
      resolved.push({ rowNumber, raw, matched: true });
    }

    let insertedMatches = 0;
    if (matchInserts.length) {
      const data = matchInserts.map((m, i) => ({
        id: `doubles-import-${tournamentId}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        tournamentId: m.tournamentId,
        categoryId: m.categoryId,
        round: m.round,
        bracketStage: m.bracketStage,
        teamOneId: m.teamOneId,
        teamTwoId: m.teamTwoId,
        teamWinnerId: m.teamWinnerId,
        playerOneScore: m.playerOneScore,
        playerTwoScore: m.playerTwoScore,
        recordedAt: m.recordedAt,
        status: 'COMPLETED' as const,
        notes: m.group ? `Grupo ${m.group}` : null,
      }));
      const result = await this.prisma.match.createMany({ data, skipDuplicates: true });
      insertedMatches = result.count;
    }

    // Compute group standings from the imported matches.
    const standings = await this.computeDoublesStandings(tournamentId);

    return {
      tournamentId,
      processedRows: matchInserts.length,
      insertedMatches,
      rejectedRows,
      resolved,
      unmatchedNames: Array.from(unmatchedNames).sort(),
      groupStandings: standings,
      rosterEntriesAvailable: rosterEntries,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async loadRosterIndex(clubId: string) {
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId },
      include: {
        linkedPlayerProfile: { select: { id: true, displayName: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const byName = new Map<string, RosterIndexEntry[]>();
    for (const e of rosterEntries) {
      const key1 = this.normalizeName(`${e.firstName} ${e.lastName}`);
      const key2 = e.linkedPlayerProfile ? this.normalizeName(e.linkedPlayerProfile.displayName ?? '') : null;
      for (const key of new Set([key1, key2].filter(Boolean) as string[])) {
        const list = byName.get(key) ?? [];
        list.push({ id: e.id, firstName: e.firstName, lastName: e.lastName });
        byName.set(key, list);
      }
    }
    return { byName, rosterEntries };
  }

  private resolveNameToRoster(name: string, byName: Map<string, RosterIndexEntry[]>, unmatchedNames: Set<string>): RosterIndexEntry | null {
    if (!name) return null;
    const candidates = byName.get(this.normalizeName(name));
    if (candidates && candidates.length === 1) return candidates[0];
    if (candidates && candidates.length > 1) {
      // Try exact-original casing fallback before declaring ambiguous.
      const exact = candidates.find(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase() === name.trim().toLowerCase() ||
        `${c.lastName} ${c.firstName}`.toLowerCase() === name.trim().toLowerCase());
      if (exact) return exact;
      unmatchedNames.add(`${name} (ambiguous)`);
      return null;
    }
    unmatchedNames.add(name);
    return null;
  }

  private normalizeName(value: string | null | undefined): string {
    return (value ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private normalizeRow(row: Record<string, unknown>): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, value] of Object.entries(row)) {
      const k = this.normalizeName(key).replace(/[^a-z0-9]+/g, '');
      const v = value === null || value === undefined ? '' : String(value).trim();
      if (k) out.set(k, v);
    }
    return out;
  }

  private firstOf(map: Map<string, string>, keys: string[]): string | null {
    for (const k of keys) {
      const normalized = k.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const v = map.get(normalized);
      if (v) return v;
    }
    return null;
  }

  private teamKey(idA: string, idB: string, group: string | null): string {
    return `${[idA, idB].sort().join('|')}|${group ?? ''}`;
  }

  private async upsertTeam(
    tournamentId: string,
    categoryId: string,
    p1: RosterIndexEntry,
    p2: RosterIndexEntry,
    group: string | null,
    cache: Map<string, { id: string }>,
    cacheKey: string,
  ) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const existing = await this.prisma.tournamentTeam.findFirst({
      where: { tournamentId, categoryId, player1RosterId: p1.id, player2RosterId: p2.id },
    });
    if (existing) {
      cache.set(cacheKey, existing);
      return existing;
    }
    const swapped = await this.prisma.tournamentTeam.findFirst({
      where: { tournamentId, categoryId, player1RosterId: p2.id, player2RosterId: p1.id },
    });
    if (swapped) {
      cache.set(cacheKey, swapped);
      return swapped;
    }
    const team = await this.prisma.tournamentTeam.create({
      data: {
        tournamentId,
        categoryId,
        player1RosterId: p1.id,
        player2RosterId: p2.id,
        group: group ?? undefined,
      },
    });
    cache.set(cacheKey, team);
    return team;
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  /**
   * Score strings like "6-4 3-6 6-2" or "6/4 7/5". Returns:
   *  - the winning side as '1' or '2' (whichever side won more sets)
   *  - null if no clear winner
   */
  private winnerFromScore(score: string | null): '1' | '2' | null {
    const parts = this.parseSetScores(score);
    if (!parts.length) return null;
    let wins1 = 0, wins2 = 0;
    for (const set of parts) {
      if (set.winner > set.loser) wins1++;
      else if (set.winner < set.loser) wins2++;
    }
    if (wins1 === wins2) return null;
    return wins1 > wins2 ? '1' : '2';
  }

  private parseScoreForSide(score: string | null, side: 0 | 1): string | null {
    const parts = this.parseSetScores(score);
    if (!parts.length) return null;
    return parts.map(p => side === 0 ? `${p.winner}-${p.loser}` : `${p.loser}-${p.winner}`).join(' ');
  }

  private parseSetScores(score: string | null): Array<{ winner: number; loser: number }> {
    if (!score) return [];
    return score.split(/[\s,;]+/).map(part => {
      const m = part.trim().match(/(\d+)\s*[-/:]\s*(\d+)/);
      if (!m) return null;
      return { winner: Number(m[1]), loser: Number(m[2]) };
    }).filter((x): x is { winner: number; loser: number } => x !== null);
  }

  /**
   * Group standings aggregation for an imported doubles tournament.
   */
  private async computeDoublesStandings(tournamentId: string) {
    const matches = await this.prisma.match.findMany({
      where: { tournamentId, teamOneId: { not: null }, teamTwoId: { not: null } },
      include: {
        teamOne: { include: { player1Roster: true, player2Roster: true } },
        teamTwo: { include: { player1Roster: true, player2Roster: true } },
      },
    });

    const standings = new Map<string, {
      teamId: string;
      players: string[];
      group: string | null;
      played: number;
      wins: number;
      losses: number;
      setsWon: number;
      setsLost: number;
    }>();

    const ensure = (team: { id: string; group: string | null; player1Roster: { firstName: string; lastName: string }; player2Roster: { firstName: string; lastName: string } }) => {
      const existing = standings.get(team.id);
      if (existing) return existing;
      const created = {
        teamId: team.id,
        players: [`${team.player1Roster.firstName} ${team.player1Roster.lastName}`, `${team.player2Roster.firstName} ${team.player2Roster.lastName}`],
        group: team.group,
        played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0,
      };
      standings.set(team.id, created);
      return created;
    };

    for (const m of matches) {
      if (!m.teamOne || !m.teamTwo) continue;
      const a = ensure({ ...m.teamOne } as any);
      const b = ensure({ ...m.teamTwo } as any);
      a.played++;
      b.played++;

      const setScores = (m.setScores as Array<{ winner: number; loser: number }> | null) ?? this.parseSetScores(m.playerOneScore ?? '');
      let setsA = 0, setsB = 0;
      for (const s of setScores) {
        if (s.winner > s.loser) setsA++;
        else if (s.winner < s.loser) setsB++;
      }
      a.setsWon += setsA;
      a.setsLost += setsB;
      b.setsWon += setsB;
      b.setsLost += setsA;

      if (m.teamWinnerId === m.teamOneId) { a.wins++; b.losses++; }
      else if (m.teamWinnerId === m.teamTwoId) { b.wins++; a.losses++; }
    }

    const grouped = new Map<string, any[]>();
    for (const s of standings.values()) {
      const key = s.group ?? '(sin grupo)';
      const list = grouped.get(key) ?? [];
      list.push({
        ...s,
        setDiff: s.setsWon - s.setsLost,
        winRate: s.played ? s.wins / s.played : 0,
      });
      grouped.set(key, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) =>
        b.wins - a.wins ||
        (b.setDiff - a.setDiff) ||
        a.players[0].localeCompare(b.players[0]));
    }

    return Array.from(grouped.entries()).map(([group, rows]) => ({ group, rows }));
  }
}
