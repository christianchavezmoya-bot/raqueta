import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRequestStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActingUser } from '../common/utils/club-scope';
import { MembershipsService } from './memberships.service';

@ApiTags('Memberships')
@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Public()
  @Get('clubs/:clubId/membership-plans')
  findPlansByClub(
    @Param('clubId') clubId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.membershipsService.findPlansByClub(clubId, {
      includeInactive: includeInactive === 'true',
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/membership-plans')
  @ApiBearerAuth()
  createPlan(
    @Param('clubId') clubId: string,
    @Body() body: any,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.membershipsService.createPlan(clubId, body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('membership-plans/:id')
  @ApiBearerAuth()
  updatePlan(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.membershipsService.updatePlan(id, body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('memberships')
  @ApiBearerAuth()
  assignMembership(@Body() body: any, @CurrentUser() actor: ActingUser) {
    return this.membershipsService.assignMembership(body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('memberships/:id')
  @ApiBearerAuth()
  updateMembership(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.membershipsService.updateMembership(id, body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('memberships/:id/cancel')
  @ApiBearerAuth()
  cancelMembership(@Param('id') id: string, @CurrentUser() actor: ActingUser) {
    return this.membershipsService.cancelMembership(id, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/membership-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request a membership plan for a club' })
  createMembershipRequest(
    @Param('clubId') clubId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
  ) {
    return this.membershipsService.createMembershipRequest(clubId, userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('players/me/membership-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my membership requests across clubs' })
  getMyMembershipRequests(@CurrentUser('id') userId: string) {
    return this.membershipsService.getMyMembershipRequests(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('clubs/:clubId/membership-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List membership requests for a club' })
  getClubMembershipRequests(
    @Param('clubId') clubId: string,
    @CurrentUser() actor: ActingUser,
    @Query('status') status?: MembershipRequestStatus,
  ) {
    return this.membershipsService.getClubMembershipRequests(clubId, actor, status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('membership-requests/:id/approve')
  @ApiBearerAuth()
  approveMembershipRequest(
    @Param('id') id: string,
    @CurrentUser() actor: ActingUser,
    @Body() body: any,
  ) {
    return this.membershipsService.approveMembershipRequest(id, actor, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('membership-requests/:id/deny')
  @ApiBearerAuth()
  denyMembershipRequest(
    @Param('id') id: string,
    @CurrentUser() actor: ActingUser,
    @Body() body: any,
  ) {
    return this.membershipsService.denyMembershipRequest(id, actor, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('membership-requests/:id/cancel')
  @ApiBearerAuth()
  cancelMembershipRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.membershipsService.cancelMembershipRequest(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/memberships')
  @ApiBearerAuth()
  getMyMemberships(@CurrentUser('id') userId: string) {
    return this.membershipsService.getUserMemberships(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('users/:userId/memberships')
  @ApiBearerAuth()
  getUserMemberships(@Param('userId') userId: string) {
    return this.membershipsService.getUserMemberships(userId);
  }
}
