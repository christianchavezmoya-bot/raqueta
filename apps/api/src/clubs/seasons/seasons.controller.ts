import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SeasonsService } from './seasons.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActingUser } from '../../common/utils/club-scope';
import { StartSeasonDto } from './dto/start-season.dto';

@ApiTags('Club Seasons')
@Controller('clubs/:clubId/seasons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
@ApiBearerAuth()
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  @ApiOperation({ summary: 'List all seasons (past and current) with their entry/match counts' })
  listSeasons(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.seasonsService.listSeasons(clubId, actor);
  }

  @Get(':seasonId/standings')
  @ApiOperation({ summary: 'Get frozen or live standings for a specific season' })
  getSeasonStandings(
    @Param('clubId') clubId: string,
    @Param('seasonId') seasonId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.seasonsService.getSeasonStandings(clubId, seasonId, actor);
  }

  @Post('start')
  @ApiOperation({ summary: 'Open a new season. If a previous closed season exists, seeds starting points via carry-forward decay + tier base points.' })
  startSeason(
    @Param('clubId') clubId: string,
    @Body() dto: StartSeasonDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.seasonsService.startSeason(clubId, dto, actor);
  }

  @Post(':seasonId/close')
  @ApiOperation({ summary: 'Close (freeze) a season, apply promotion/relegation, update division assignments on roster entries.' })
  closeSeason(
    @Param('clubId') clubId: string,
    @Param('seasonId') seasonId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.seasonsService.closeSeason(clubId, seasonId, actor);
  }
}
