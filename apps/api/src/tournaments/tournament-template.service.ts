import { Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

/**
 * Generates a multi-tab .xlsx import template, club-scoped:
 *   - Configuración: pre-filled with current ClubRankingRule rows + season decay/tier-base settings
 *   - Miembros:      roster import shape (matches the Stage 6/11 importer)
 *   - Resultados:    one row per match (category/categoryKey, winner, loser, sets, date)
 *   - Liguilla:      Liguilla (promotion bracket) row format for /tournaments/:id/import-liguilla
 *   - Dobles:        doubles round-robin row format for /tournaments/:id/import-dobles
 *
 * Each tab has a Spanish instruction row at the top reminding staff to leave
 * the labeled columns intact, plus an extra-notes column for any
 * free-form context the importer will ignore.
 */
@Injectable()
export class TournamentTemplateService {
  constructor(private prisma: PrismaService) {}

  async generateTemplate(clubId: string, actor: ActingUser): Promise<Buffer> {
    await assertClubScope(actor, clubId, this.prisma);

    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');

    const [rules, season, divisionConfigs] = await Promise.all([
      this.prisma.clubRankingRule.findMany({
        where: { clubId },
        orderBy: [{ active: 'desc' }, { categoryKey: 'asc' }],
      }),
      this.prisma.rankingSeason.findFirst({
        where: { clubId, status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.clubDivisionConfig.findMany({
        where: { clubId },
        orderBy: { displayOrder: 'asc' },
      }),
    ]);

    const wb = XLSX.utils.book_new();

    // ─── 1. Configuración ───────────────────────────────────────────────
    const configRows: Array<Array<string | number>> = [];
    configRows.push([
      '# Plantilla Raqueta — Configuración',
      '',
      `Club: ${club.name}`,
      `Generada: ${new Date().toISOString().slice(0, 10)}`,
    ]);
    configRows.push([]);
    configRows.push([
      'Importante: no renombres ni elimines las columnas marcadas, pero puedes añadir columnas adicionales sin problema (serán ignoradas al re-importar).',
    ]);
    configRows.push([]);
    configRows.push(['Clave de categoría', 'Etiqueta visible', 'Puntos al ganador', 'Puntos al perdedor', 'Activa']);
    for (const r of rules) {
      configRows.push([
        r.categoryKey,
        r.label,
        r.winnerPoints,
        r.loserPoints,
        r.active ? 'SI' : 'NO',
      ]);
    }

    configRows.push([]);
    configRows.push(['Season carry-forward decay (%)', season?.carryForwardDecayPercent ?? 50]);
    configRows.push(['Etiqueta de temporada actual', season?.label ?? '']);

    if (divisionConfigs.length) {
      configRows.push([]);
      configRows.push(['División', 'Etiqueta visible', 'Puntos base de tier', 'Orden']);
      for (const d of divisionConfigs) {
        configRows.push([d.divisionKey, d.label, d.tierBasePoints, d.displayOrder]);
      }
    }
    const configSheet = XLSX.utils.aoa_to_sheet(configRows);
    this.setColumnWidths(configSheet, [38, 38, 22, 22, 12]);
    XLSX.utils.book_append_sheet(wb, configSheet, 'Configuración');

    // ─── 2. Miembros ────────────────────────────────────────────────────
    const memberRows: Array<Array<string>> = [
      ['# Plantilla Raqueta — Miembros (importar ANTES de cualquier resultado)'],
      ['Importante: no renombres las columnas marcadas con *. Columnas adicionales se ignoran al re-importar. La columna fechaNacimiento* es obligatoria.'],
      [],
      ['nombres*', 'apellidos*', 'fechaNacimiento*', 'rut', 'direccion', 'comuna', 'division', 'email', 'notas'],
    ];
    const memberSheet = XLSX.utils.aoa_to_sheet(memberRows);
    this.setColumnWidths(memberSheet, [24, 24, 18, 16, 30, 18, 14, 30, 30]);
    XLSX.utils.book_append_sheet(wb, memberSheet, 'Miembros');

    // ─── 3. Resultados ──────────────────────────────────────────────────
    const categoryKeyHint = rules.map(r => r.categoryKey).join(', ') || 'STRAIGHT_SETS';
    const resultRows: Array<Array<string>> = [
      ['# Plantilla Raqueta — Resultados (una fila por partido)'],
      [
        'Importante: no renombres las columnas marcadas con *. Columnas adicionales se ignoran al re-importar. ' +
        `Para tipoResultado usa la Clave de categoría de la hoja Configuración (ej: ${categoryKeyHint}).`,
      ],
      [
        '?temporadaId — opcional: id de la temporada donde guardar los resultados. Si la omites, se usa la temporada activa del club. ' +
        'Crea una temporada por cada año (no mezcles años en una sola temporada).',
      ],
      [],
      ['categoria', 'ganador', 'perdedor', 'tipoResultado', 'sets', 'fecha', 'notas'],
      ['Masculino Intermedio', 'Juan Pérez', 'Carlos Silva', 'STRAIGHT_SETS', '6-4 6-3', '2026-08-15', ''],
      ['Masculino Intermedio', 'Carlos Silva', 'Juan Pérez', 'TIEBREAK_DECIDER', '6-4 4-6 7-5', '2026-08-22', ''],
    ];
    const resultSheet = XLSX.utils.aoa_to_sheet(resultRows);
    this.setColumnWidths(resultSheet, [22, 24, 24, 22, 22, 14, 28]);
    XLSX.utils.book_append_sheet(wb, resultSheet, 'Resultados');

    // ─── 4. Liguilla ────────────────────────────────────────────────────
    const liguillaRows: Array<Array<string>> = [
      ['# Plantilla Raqueta — Liguilla (bracket de promoción / playoff)'],
      [
        'Importante: no renombres las columnas marcadas con *. Columnas adicionales se ignoran al re-importar. ' +
        '?etapa indica la sub-etapa del bracket (MAIN = principal; WINNERS = sub-bracket de ganadores; LOSERS = sub-bracket de perdedores / consolación). ' +
        'Los nombres deben existir en el roster (hoja Miembros) — los que no aparezcan se reportan como "no encontrados" y la fila se rechaza.',
      ],
      ['?tournamentId — obligatorio: id del torneo al que se importan las llaves (el torneo debe existir ya con sus categorías creadas).'],
      [],
      ['categoria', 'ronda', 'etapa', 'jugador1', 'jugador2', 'ganador', 'sets', 'colocacion', 'fecha', 'notas'],
      ['Masculino Intermedio', 'R1', 'MAIN',    'Juan Pérez', 'Carlos Silva', 'Juan Pérez', '6-4 6-3', '5',  '2026-08-15', ''],
      ['Masculino Intermedio', 'SF', 'LOSERS',  'Carlos Silva', 'Pedro Soto',  '',           '',         '3',  '2026-08-20', ''],
      ['Masculino Intermedio', 'FINAL', 'MAIN', 'Juan Pérez',  'Mario López', 'Juan Pérez', '6-2 7-6', '1',  '2026-08-25', ''],
    ];
    const liguillaSheet = XLSX.utils.aoa_to_sheet(liguillaRows);
    this.setColumnWidths(liguillaSheet, [24, 10, 12, 24, 24, 24, 16, 12, 14, 24]);
    XLSX.utils.book_append_sheet(wb, liguillaSheet, 'Liguilla');

    // ─── 5. Dobles ──────────────────────────────────────────────────────
    const doblesRows: Array<Array<string>> = [
      ['# Plantilla Raqueta — Dobles (round-robin de parejas)'],
      [
        'Importante: no renombres las columnas marcadas con *. Columnas adicionales se ignoran al re-importar. ' +
        'Cada pareja aparece dos veces en el archivo: una vez como "Pareja A" (jugador1/jugador2) y otra vez como "Pareja B" (jugador3/jugador4). ' +
        'El campo "ganador" puede ser "1" (pareja A), "2" (pareja B), o el nombre completo de la pareja ganadora.',
      ],
      ['?tournamentId — obligatorio: id del torneo (debe estar creado con formato DOUBLES o MIXED y sus categorías).'],
      [],
      ['categoria', 'grupo', 'jugador1', 'jugador2', 'jugador3', 'jugador4', 'sets', 'ganador', 'fecha', 'notas'],
      ['Dobles A', 'A', 'Juan Pérez', 'Mario López', 'Carlos Silva', 'Pedro Soto', '6-4 6-3', '1', '2026-08-15', ''],
      ['Dobles A', 'A', 'Carlos Silva', 'Pedro Soto', 'Juan Pérez', 'Mario López', '3-6 6-4 7-5', '2', '2026-08-22', ''],
    ];
    const doblesSheet = XLSX.utils.aoa_to_sheet(doblesRows);
    this.setColumnWidths(doblesSheet, [16, 10, 22, 22, 22, 22, 16, 14, 14, 24]);
    XLSX.utils.book_append_sheet(wb, doblesSheet, 'Dobles');

    // ─── 6. Instrucciones ───────────────────────────────────────────────
    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['Plantilla Raqueta — Guía rápida de uso'],
      [],
      ['1. Miembros'],
      ['   • Importa PRIMERO la hoja Miembros. Es la hoja base: cualquier resultado o llave que importe después debe poder resolver los nombres contra estas filas.'],
      ['   • Los jugadores sin cuenta en la app también se admiten — basta con que existan aquí.'],
      [],
      ['2. Configuración'],
      ['   • Edita libremente las reglas de puntuación. Al re-importar esta misma plantilla, los valores reemplazan los actuales (es una alternativa al panel web de Ajustes, ambas rutas convergen).'],
      ['   • Las reglas de Configuración aplican a TODA la importación de Resultados.'],
      [],
      ['3. Resultados (partidos sueltos)'],
      ['   • Una fila por partido — evita el formato de matriz, reduce errores.'],
      ['   • tipoResultado debe coincidir con la "Clave de categoría" de Configuración.'],
      ['   • Si quieres separar años, crea una temporada por cada año y pasa su id como ?temporadaId al endpoint.'],
      [],
      ['4. Liguilla (bracket de promoción / playoff)'],
      ['   • POST /tournaments/:tournamentId/import-liguilla'],
      ['   • etapa ∈ {MAIN, WINNERS, LOSERS}. La sub-etapa se preserva al importar — un jugador que pierde en MAIN pasa a LOSERS con su propia llave hasta la final.'],
      ['   • colocacion es opcional (1 = campeón, 2 = finalista, etc.).'],
      [],
      ['5. Dobles (round-robin de parejas)'],
      ['   • POST /tournaments/:tournamentId/import-dobles'],
      ['   • Necesitas haber creado el torneo con formato DOUBLES o MIXED y al menos una categoría.'],
      [],
      ['? Las filas que no podamos resolver (nombre desconocido en roster o categoría inexistente) se rechazan y se reportan en la respuesta del endpoint — nunca se inventan datos.'],
    ]);
    this.setColumnWidths(instructionsSheet, [120]);
    XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instrucciones');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]) {
    sheet['!cols'] = widths.map(w => ({ wch: w }));
  }
}
