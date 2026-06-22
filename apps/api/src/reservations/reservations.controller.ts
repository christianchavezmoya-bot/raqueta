import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Reservations')
@Controller()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Public()
  @Get('clubs/:clubId/availability')
  getAvailability(
    @Param('clubId') clubId: string,
    @Query('courtId') courtId: string,
    @Query('date') date: string,
  ) {
    return this.reservationsService.getAvailability(clubId, courtId, new Date(date));
  }

  @UseGuards(JwtAuthGuard)
  @Post('reservations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create reservation' })
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.reservationsService.create({
      ...body,
      userId,
      createdBy: userId,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('reservations/admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create reservation (admin/reception)' })
  createAdmin(@Body() body: any, @CurrentUser('id') createdBy: string) {
    return this.reservationsService.create({
      ...body,
      createdBy,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/reservations')
  @ApiBearerAuth()
  getMyReservations(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reservationsService.findByUser(userId, +page, +limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('users/:userId/reservations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reservations by user ID (admin)' })
  getByUserId(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reservationsService.findByUser(userId, +page, +limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('clubs/:clubId/reservations')
  @ApiBearerAuth()
  findByClub(
    @Param('clubId') clubId: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    return this.reservationsService.findByClub(clubId, {
      date: date ? new Date(date) : undefined,
      status,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('reservations/:id/cancel')
  @ApiBearerAuth()
  cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const staffRoles: Role[] = [Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION];
    const isStaff = staffRoles.includes(role as Role);
    return this.reservationsService.cancel(id, userId, isStaff);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('reservations/:id/check-in')
  @ApiBearerAuth()
  checkIn(@Param('id') id: string) {
    return this.reservationsService.checkIn(id);
  }
}
