import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { TournamentImportService } from './tournament-import.service';
import { TournamentExportService } from './tournament-export.service';
import { TournamentTemplateService } from './tournament-template.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ActingUser } from '../common/utils/club-scope';

@ApiTags('Tournaments')
@Controller()
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly importService: TournamentImportService,
    private readonly exportService: TournamentExportService,
    private readonly templateService: TournamentTemplateService,
  ) {}

  @Public()
  @Get('tournaments')
  findAll(@Query('clubId') clubId?: string) {
    return this.tournamentsService.findAll(clubId);
  }

  @Public()
  @Get('tournaments/:id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/tournaments')
  @ApiBearerAuth()
  create(@Param('clubId') clubId: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.tournamentsService.create(clubId, body, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('tournaments/:id')
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() body: any) {
    return this.tournamentsService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @Delete('tournaments/:id')
  @ApiBearerAuth()
  delete(@Param('id') id: string) {
    return this.tournamentsService.delete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/categories')
  @ApiBearerAuth()
  addCategory(@Param('id') id: string, @Body() body: any) {
    return this.tournamentsService.addCategory(id, body);
  }

  /**
   * Self-service registration for an authenticated user. Optionally registers
   * on behalf of a child via `forChildUserId`. The tournament registration
   * always resolves to a roster entry (a roster row will be created on the fly
   * for players who don't yet have one for this club). Use
   * `POST /tournaments/:id/register-team` for doubles-format tournaments.
   */
  @UseGuards(JwtAuthGuard)
  @Post('tournaments/:id/register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register the current user (or a linked child) for a tournament category' })
  register(
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
    @Body('forChildUserId') forChildUserId: string | undefined,
    @CurrentUser('id') actorId: string,
  ) {
    return this.tournamentsService.register(id, categoryId, actorId, forChildUserId ?? null);
  }

  /**
   * Register a doubles team (pair of roster entries) to a DOUBLES / MIXED
   * format tournament category.
   */
  @UseGuards(JwtAuthGuard)
  @Post('tournaments/:id/register-team')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a doubles team (two roster entries) for a DOUBLES / MIXED tournament category' })
  registerTeam(
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
    @Body() body: { player1RosterId: string; player2RosterId: string; group?: string; label?: string },
    @CurrentUser('id') actorId: string,
  ) {
    return this.tournamentsService.registerTeam(id, categoryId, actorId, body);
  }

  /**
   * Staff-only path to register a roster entry that has no app account behind
   * it. Used when an admin enrolls a paper/minor/legacy participant.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/register-roster')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff-only: register a roster entry with no app account to a tournament category' })
  registerRosterOnly(
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
    @Body('rosterId') rosterId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.tournamentsService.registerRosterOnly(id, categoryId, actorId, { rosterId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/generate-fixture')
  @ApiBearerAuth()
  generateFixture(@Param('id') id: string) {
    return this.tournamentsService.generateFixture(id);
  }

  // ─── Imports (Part B) ────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/import-liguilla')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import historical Liguilla (promotion) bracket results into the tournament' })
  importLiguilla(
    @Param('id') id: string,
    @Body() body: { rows: Array<Record<string, unknown>> },
    @CurrentUser() actor: ActingUser,
  ) {
    return this.importService.importLiguilla(id, body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/import-dobles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import historical Dobles (round-robin) results into the tournament' })
  importDobles(
    @Param('id') id: string,
    @Body() body: { rows: Array<Record<string, unknown>> },
    @CurrentUser() actor: ActingUser,
  ) {
    return this.importService.importDobles(id, body, actor);
  }

  // ─── Export (Part C) ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('tournaments/:id/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download the tournament as a multi-sheet XLSX workbook' })
  async exportTournament(@Param('id') id: string, @Res() res: Response) {
    const buf = await this.exportService.exportTournament(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tournament-${id}.xlsx"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }

  // ─── Import template (Part D) ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('clubs/:clubId/import-template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download a club-scoped multi-tab XLSX import template' })
  async getImportTemplate(
    @Param('clubId') clubId: string,
    @Res() res: Response,
    @CurrentUser() actor: ActingUser,
  ) {
    const buf = await this.templateService.generateTemplate(clubId, actor);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="raqueta-template-${clubId}.xlsx"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }
}
