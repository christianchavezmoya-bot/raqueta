import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Tournaments')
@Controller()
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

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

  @UseGuards(JwtAuthGuard)
  @Post('tournaments/:id/register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register for tournament (optionally for a linked child via forChildUserId)' })
  register(
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
    @Body('forChildUserId') forChildUserId: string | undefined,
    @CurrentUser('id') actorId: string,
  ) {
    return this.tournamentsService.register(id, categoryId, actorId, forChildUserId ?? null);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('tournaments/:id/generate-fixture')
  @ApiBearerAuth()
  generateFixture(@Param('id') id: string) {
    return this.tournamentsService.generateFixture(id);
  }
}
