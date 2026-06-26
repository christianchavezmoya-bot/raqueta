import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { HistoryService } from './history.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActingUser } from '../common/utils/club-scope';

@ApiTags('History')
@Controller('clubs/:clubId/history')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
@ApiBearerAuth()
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('courts')
  @ApiOperation({ summary: 'Get historical court reservations for a club' })
  getCourtHistory(
    @Param('clubId') clubId: string,
    @CurrentUser() actor: ActingUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.historyService.getCourtHistory(
      clubId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        courtId,
      },
      actor,
    );
  }

  @Get('matches')
  @ApiOperation({ summary: 'Get combined historical match results for a club' })
  getMatchHistory(
    @Param('clubId') clubId: string,
    @CurrentUser() actor: ActingUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('competitionType') competitionType?: string | string[],
    @Query('division') division?: string,
    @Query('category') category?: string,
  ) {
    const values = Array.isArray(competitionType)
      ? competitionType
      : competitionType?.split(',').map(value => value.trim()).filter(Boolean) ?? [];

    return this.historyService.getMatchHistory(
      clubId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        competitionTypes: values.length ? (values as Array<'LADDER' | 'TOURNAMENT' | 'PERSONAL_LOG'>) : undefined,
        division,
        category,
      },
      actor,
    );
  }

  @Get('players/:rosterId')
  @ApiOperation({ summary: 'Get the full history for one roster member' })
  getPlayerHistory(
    @Param('clubId') clubId: string,
    @Param('rosterId') rosterId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.historyService.getPlayerHistory(clubId, rosterId, actor);
  }
}
