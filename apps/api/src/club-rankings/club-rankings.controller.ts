import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClubRankingsService } from './club-rankings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActingUser } from '../common/utils/club-scope';
import { UpsertClubRankingRulesDto } from './dto/upsert-club-ranking-rules.dto';
import { CreateClubMatchResultDto } from './dto/create-club-match-result.dto';

@ApiTags('Club Rankings')
@Controller()
export class ClubRankingsController {
  constructor(private readonly clubRankingsService: ClubRankingsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Get('clubs/:clubId/ranking-rules')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get club-configurable internal ranking rules' })
  getRules(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.clubRankingsService.getRules(clubId, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Put('clubs/:clubId/ranking-rules')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create/update club internal ranking rules' })
  updateRules(
    @Param('clubId') clubId: string,
    @Body() dto: UpsertClubRankingRulesDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubRankingsService.updateRules(clubId, dto, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Get('clubs/:clubId/ranking-players')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List roster entries for match-result entry' })
  getClubRosterForEntry(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.clubRankingsService.getClubRosterForEntry(clubId, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/match-results')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create one internal club match result and recalculate standings' })
  createMatchResult(
    @Param('clubId') clubId: string,
    @Body() dto: CreateClubMatchResultDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubRankingsService.createMatchResult(clubId, dto, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/match-results/import')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Import internal club match results from CSV/XLSX and recalculate standings' })
  importMatchResults(
    @Param('clubId') clubId: string,
    @Query('seasonId') seasonId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubRankingsService.importMatchResults(clubId, file, actor, { seasonId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/match-results/import-grid')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Import historical match grid (matrix CSV) into match results' })
  importMatchGrid(
    @Param('clubId') clubId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubRankingsService.importMatchGrid(clubId, file, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/rankings/recalculate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recalculate internal club standings from current rules + raw results' })
  recalculate(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.clubRankingsService.recalculate(clubId, actor);
  }

  @Get('clubs/:clubId/rankings/internal')
  @ApiOperation({ summary: 'Get current internal club standings' })
  getInternalRankings(@Param('clubId') clubId: string) {
    return this.clubRankingsService.getInternalRankings(clubId);
  }
}
