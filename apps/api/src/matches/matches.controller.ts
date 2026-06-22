import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Matches')
@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Public()
  @Get('matches/:id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Patch('matches/:id')
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() body: any) {
    return this.matchesService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('matches/:id/result')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record match result' })
  recordResult(@Param('id') id: string, @Body() body: any) {
    return this.matchesService.recordResult(id, body);
  }

  @Public()
  @Get('players/:playerId/matches')
  findByPlayer(@Param('playerId') playerId: string) {
    return this.matchesService.findByPlayer(playerId);
  }
}
