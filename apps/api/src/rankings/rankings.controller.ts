import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RankingsService } from './rankings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Rankings')
@Controller()
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Public()
  @Get('clubs/:clubId/rankings')
  findByClub(
    @Param('clubId') clubId: string,
    @Query('category') category?: string,
    @Query('season') season?: string,
  ) {
    return this.rankingsService.findByClub(clubId, category, season);
  }

  @Public()
  @Get('players/:playerId/ranking-history')
  getPlayerHistory(@Param('playerId') playerId: string) {
    return this.rankingsService.getPlayerHistory(playerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('rankings/recalculate')
  @ApiBearerAuth()
  recalculate(@Query('clubId') clubId: string, @Query('season') season?: string) {
    return this.rankingsService.recalculate(clubId, season);
  }
}
