import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BonusPointsService } from './bonus-points.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActingUser } from '../../common/utils/club-scope';
import { AwardBonusDto } from './dto/award-bonus.dto';

@ApiTags('Club Bonus Points')
@Controller('clubs/:clubId/bonus-points')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
@ApiBearerAuth()
export class BonusPointsController {
  constructor(private readonly bonusPointsService: BonusPointsService) {}

  @Get('types')
  @ApiOperation({ summary: 'List bonus point types configured for this club' })
  listBonusTypes(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.bonusPointsService.listBonusTypes(clubId, actor);
  }

  @Post()
  @ApiOperation({ summary: 'Award bonus points to a roster member for the active season' })
  awardBonus(
    @Param('clubId') clubId: string,
    @Body() dto: AwardBonusDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.bonusPointsService.awardBonus(clubId, dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Audit history of bonus point awards for a season' })
  listAwards(
    @Param('clubId') clubId: string,
    @Query('seasonId') seasonId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.bonusPointsService.listAwards(clubId, seasonId, actor);
  }
}
