import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ParentChildService } from './parent-child.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Parent-Child')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ParentChildController {
  constructor(private readonly svc: ParentChildService) {}

  @Post('players/me/children/request-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request parent link to a child by their RUT' })
  requestLink(
    @CurrentUser('id') parentUserId: string,
    @Body('childRut') childRut: string,
  ) {
    return this.svc.requestLink(parentUserId, childRut);
  }

  @Get('players/me/children')
  @ApiOperation({ summary: 'List my linked children (all statuses)' })
  listMyChildren(@CurrentUser('id') parentUserId: string) {
    return this.svc.listMyChildren(parentUserId);
  }

  @Patch('players/me/children/:childUserId/transact-toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle canTransact for a linked child (parent or club staff)' })
  toggleTransact(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('staffClubId') actorStaffClubId: string | undefined,
    @Param('childUserId') childUserId: string,
    @Body('canTransact') canTransact: boolean,
  ) {
    return this.svc.toggleTransact(
      { id: actorId, role: actorRole as Role, staffClubId: actorStaffClubId ?? null },
      childUserId,
      canTransact,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('clubs/:clubId/parent-child-links')
  @ApiOperation({ summary: 'List parent-child link requests for a club (staff view)' })
  listForClub(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('staffClubId') actorStaffClubId: string | undefined,
    @Param('clubId') clubId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listPendingForClub(
      { id: actorId, role: actorRole as Role, staffClubId: actorStaffClubId ?? null },
      clubId,
      status,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('parent-child-links/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending parent-child link (club staff)' })
  approve(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('staffClubId') actorStaffClubId: string | undefined,
    @Param('id') linkId: string,
  ) {
    return this.svc.approveLink(
      { id: actorId, role: actorRole as Role, staffClubId: actorStaffClubId ?? null },
      linkId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('parent-child-links/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending parent-child link (club staff)' })
  reject(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('staffClubId') actorStaffClubId: string | undefined,
    @Param('id') linkId: string,
  ) {
    return this.svc.rejectLink(
      { id: actorId, role: actorRole as Role, staffClubId: actorStaffClubId ?? null },
      linkId,
    );
  }
}
