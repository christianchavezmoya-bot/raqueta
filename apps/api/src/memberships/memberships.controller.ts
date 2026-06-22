import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Memberships')
@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Public()
  @Get('clubs/:clubId/membership-plans')
  findPlansByClub(@Param('clubId') clubId: string) {
    return this.membershipsService.findPlansByClub(clubId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/membership-plans')
  @ApiBearerAuth()
  createPlan(@Param('clubId') clubId: string, @Body() body: any) {
    return this.membershipsService.createPlan(clubId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('membership-plans/:id')
  @ApiBearerAuth()
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.membershipsService.updatePlan(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('memberships')
  @ApiBearerAuth()
  assignMembership(@Body() body: any) {
    return this.membershipsService.assignMembership(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('memberships/:id')
  @ApiBearerAuth()
  updateMembership(@Param('id') id: string, @Body() body: any) {
    return this.membershipsService.updateMembership(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/memberships')
  @ApiBearerAuth()
  getMyMemberships(@CurrentUser('id') userId: string) {
    return this.membershipsService.getUserMemberships(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Get('users/:userId/memberships')
  @ApiBearerAuth()
  getUserMemberships(@Param('userId') userId: string) {
    return this.membershipsService.getUserMemberships(userId);
  }
}
