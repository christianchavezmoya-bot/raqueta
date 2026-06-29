import { Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Generates an .xlsx file reflecting the current state of a tournament:
 *  - Resumen        tournament metadata + status
 *  - Inscripciones  roster-or-team registrations
 *  - Llaves         bracket structure (grouped by bracketStage, then by round)
 *  - Resultados     completed matches with scores
 *  - Tabla de posiciones (positions / standings)
 *
 * Uses the existing `xlsx` package — no new dependencies are pulled in.
 */
@Injectable()
export class TournamentExportService {
  constructor(private prisma: PrismaService) {}

  async exportTournament(tournamentId: string): Promise<Buffer> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        club: { include: { profile: true } },
        categories: {
          include: {
            teams: { include: { player1Roster: true, player2Roster: true } },
            registrations: {
              include: {
                roster: true,
                team: { include: { player1Roster: true, player2Roster: true } },
              },
              orderBy: { registeredAt: 'asc' },
            },
          },
        },
        registrations: {
          include: { roster: true, team: { include: { player1Roster: true, player2Roster: true } } },
          orderBy: { registeredAt: 'asc' },
        },
        matches: {
          include: {
            category: true,
            playerOneRoster: true,
            playerTwoRoster: true,
            winnerRoster: true,
            teamOne: { include: { player1Roster: true, player2Roster: true } },
            teamTwo: { include: { player1Roster: true, player2Roster: true } },
            teamWinner: { include: { player1Roster: true, player2Roster: true } },
            court: true,
          },
          orderBy: [{ bracketStage: 'asc' }, { round: 'asc' }, { scheduledTime: 'asc' }],
        },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const wb = XLSX.utils.book_new();

    // ─── Hoja 1: Resumen ───────────────────────────────────────────────
    const resumen: Array<[string, string | number | null]> = [
      ['Torneo',                     tournament.name],
      ['Club',                       tournament.club?.name ?? ''],
      ['Formato',                    tournament.format],
      ['Estado',                     tournament.status],
      ['Inicio',                     this.fmtDate(tournament.startDate)],
      ['Fin',                        this.fmtDate(tournament.endDate)],
      ['Inscripción desde',          this.fmtDate(tournament.registrationOpenDate)],
      ['Inscripción hasta',          this.fmtDate(tournament.registrationCloseDate)],
      ['Equipos / jugadores máx.',   tournament.maxPlayers ?? ''],
      ['Precio',                     tournament.price ?? 0],
      ['Club rival (interclub)',     tournament.opponentClubName ?? ''],
      ['Categorías',                 tournament.categories.map(c => c.name).join(' · ')],
    ];
    const resumenSheet = XLSX.utils.aoa_to_sheet([['Atributo', 'Valor'], ...resumen]);
    this.setColumnWidths(resumenSheet, [28, 70]);
    XLSX.utils.book_append_sheet(wb, resumenSheet, 'Resumen');

    // ─── Hoja 2: Inscripciones ─────────────────────────────────────────
    const inscrRows: string[][] = [
      ['Categoría', 'Tipo', 'Participante', 'Roster', 'Pareja', 'Estado', 'Pago', 'Fecha de inscripción'],
    ];
    for (const r of tournament.registrations) {
      const cat = tournament.categories.find(c => c.id === r.categoryId)?.name ?? '';
      const playerName = r.roster
        ? `${r.roster.firstName} ${r.roster.lastName}`
        : '';
      const teamLabel = r.team
        ? `${r.team.player1Roster?.firstName ?? ''} ${r.team.player1Roster?.lastName ?? ''} & ${r.team.player2Roster?.firstName ?? ''} ${r.team.player2Roster?.lastName ?? ''}`.trim()
        : '';
      inscrRows.push([
        cat,
        r.team ? 'Pareja' : 'Jugador',
        playerName,
        r.rosterId ?? '',
        teamLabel,
        r.status,
        r.paymentStatus,
        this.fmtDate(r.registeredAt),
      ]);
    }
    const inscrSheet = XLSX.utils.aoa_to_sheet(inscrRows);
    this.setColumnWidths(inscrSheet, [22, 10, 30, 30, 40, 14, 14, 22]);
    XLSX.utils.book_append_sheet(wb, inscrSheet, 'Inscripciones');

    // ─── Hoja 3: Llaves (bracket) ─────────────────────────────────────
    const bracketSheet = this.buildBracketSheet(tournament.matches);
    XLSX.utils.book_append_sheet(wb, bracketSheet, 'Llaves');

    // ─── Hoja 4: Resultados ────────────────────────────────────────────
    const resultRows: string[][] = [
      ['Categoría', 'Sub-etapa', 'Ronda', 'Jugador / Pareja 1', 'Jugador / Pareja 2', 'Sets', 'Ganador', 'Fecha', 'Cancha'],
    ];
    for (const m of tournament.matches) {
      const left  = m.playerOneRoster ? `${m.playerOneRoster.firstName} ${m.playerOneRoster.lastName}`
                  : m.teamOne        ? `${m.teamOne.player1Roster.firstName} ${m.teamOne.player1Roster.lastName} & ${m.teamOne.player2Roster.firstName} ${m.teamOne.player2Roster.lastName}`
                                     : '';
      const right = m.playerTwoRoster ? `${m.playerTwoRoster.firstName} ${m.playerTwoRoster.lastName}`
                  : m.teamTwo        ? `${m.teamTwo.player1Roster.firstName} ${m.teamTwo.player1Roster.lastName} & ${m.teamTwo.player2Roster.firstName} ${m.teamTwo.player2Roster.lastName}`
                                     : '';
      const winner = m.winnerRoster     ? `${m.winnerRoster.firstName} ${m.winnerRoster.lastName}`
                   : m.teamWinner      ? `${m.teamWinner.player1Roster.firstName} ${m.teamWinner.player1Roster.lastName} & ${m.teamWinner.player2Roster.firstName} ${m.teamWinner.player2Roster.lastName}`
                   : '';
      const sets = m.playerOneScore ?? m.playerTwoScore ?? '';
      resultRows.push([
        m.category?.name ?? '',
        this.translateStage(m.bracketStage),
        m.round ?? '',
        left,
        right,
        sets,
        winner,
        this.fmtDate(m.scheduledTime ?? m.recordedAt),
        m.court?.name ?? '',
      ]);
    }
    const resultSheet = XLSX.utils.aoa_to_sheet(resultRows);
    this.setColumnWidths(resultSheet, [22, 14, 14, 28, 28, 16, 28, 22, 16]);
    XLSX.utils.book_append_sheet(wb, resultSheet, 'Resultados');

    // ─── Hoja 5: Tabla de posiciones ─────────────────────────────────
    const posiciones = this.computePositionTable(tournament.matches);
    const posicionesSheet = XLSX.utils.aoa_to_sheet([
      ['Sub-etapa', 'Ronda', 'Ganador'],
      ...posiciones.map(p => [this.translateStage(p.stage), p.round, p.winner]),
    ]);
    this.setColumnWidths(posicionesSheet, [14, 14, 50]);
    XLSX.utils.book_append_sheet(wb, posicionesSheet, 'Tabla de posiciones');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private buildBracketSheet(matches: any[]) {
    // Group matches by category → stage → round, producing one row per match
    // in display order. This matches the "two-column per round" pattern that
    // club admins typically send via WhatsApp/email.
    const rows: string[][] = [
      ['Sub-etapa', 'Ronda', 'Jugador / Pareja 1', 'Resultado', 'Jugador / Pareja 2', 'Fecha', 'Estado'],
    ];
    // Order: MAIN first (primary progression), then WINNERS then LOSERS.
    const order = ['MAIN', 'WINNERS', 'LOSERS'];

    for (const stage of order) {
      const stageMatches = matches.filter(m => m.bracketStage === stage);
      if (!stageMatches.length) continue;

      // Sort by round label (R1, R2, QF, SF, FINAL, etc.).
      const roundOrder = ['R1', 'R2', 'R3', 'QF', 'QF2', 'SF', 'F', 'FINAL'];
      const scored = stageMatches.slice().sort((a, b) => {
        const ai = roundOrder.indexOf(a.round ?? '');
        const bi = roundOrder.indexOf(b.round ?? '');
        if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return ((a.scheduledTime ?? a.recordedAt)?.getTime?.() ?? 0) - ((b.scheduledTime ?? b.recordedAt)?.getTime?.() ?? 0);
      });

      for (const m of scored) {
        const left = m.playerOneRoster
          ? `${m.playerOneRoster.firstName} ${m.playerOneRoster.lastName}`
          : m.teamOne
            ? `${m.teamOne.player1Roster.firstName} ${m.teamOne.player1Roster.lastName} & ${m.teamOne.player2Roster.firstName} ${m.teamOne.player2Roster.lastName}`
            : '';
        const right = m.playerTwoRoster
          ? `${m.playerTwoRoster.firstName} ${m.playerTwoRoster.lastName}`
          : m.teamTwo
            ? `${m.teamTwo.player1Roster.firstName} ${m.teamTwo.player2Roster.firstName} & ${m.teamTwo.player2Roster.firstName} ${m.teamTwo.player2Roster.lastName}`
            : '';
        const score = [m.playerOneScore, m.playerTwoScore].filter(Boolean).join(' / ') || '';
        rows.push([
          this.translateStage(m.bracketStage),
          m.round ?? '',
          left,
          score,
          right,
          this.fmtDate(m.scheduledTime ?? m.recordedAt),
          m.status,
        ]);
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    this.setColumnWidths(sheet, [14, 12, 30, 16, 30, 22, 14]);
    return sheet;
  }

  private computePositionTable(matches: any[]) {
    const rows: Array<{ stage: string; round: string; winner: string }> = [];
    // For each match in the final round of MAIN/WINNERS/LOSERS, identify the winner.
    const finals = matches.filter(m => (m.round ?? '').toUpperCase() === 'FINAL' || (m.round ?? '').toUpperCase() === 'F');
    for (const m of finals) {
      const winName = m.winnerRoster
        ? `${m.winnerRoster.firstName} ${m.winnerRoster.lastName}`
        : m.teamWinner
          ? `${m.teamWinner.player1Roster.firstName} ${m.teamWinner.player1Roster.lastName} & ${m.teamWinner.player2Roster.firstName} ${m.teamWinner.player2Roster.lastName}`
          : '(por determinar)';
      rows.push({ stage: m.bracketStage, round: m.round, winner: winName });
    }
    return rows;
  }

  private translateStage(stage: string): string {
    switch (stage) {
      case 'MAIN':    return 'Principal';
      case 'WINNERS': return 'Ganadores';
      case 'LOSERS':  return 'Perdedores';
      default: return stage;
    }
  }

  private fmtDate(d: Date | null | undefined): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return '';
    // yyyy-mm-dd hh:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]) {
    sheet['!cols'] = widths.map(w => ({ wch: w }));
  }
}
