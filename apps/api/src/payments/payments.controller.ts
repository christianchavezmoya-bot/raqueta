import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get('clubs/:clubId/payments')
  @ApiBearerAuth()
  findByClub(
    @Param('clubId') clubId: string,
    @Query('status') status?: string,
    @Query('method') method?: string,
  ) {
    return this.paymentsService.findByClub(clubId, { status, method });
  }

  @UseGuards(JwtAuthGuard)
  @Post('payments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment record (optionally for a linked child via forChildUserId)' })
  create(@Body() body: any, @CurrentUser('id') actorId: string) {
    const { forChildUserId, ...rest } = body;
    return this.paymentsService.create({
      ...rest,
      userId: actorId,
      actorId,
      forChildUserId: forChildUserId ?? null,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('payments/:id/confirm-manual')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm manual payment' })
  confirmManual(
    @Param('id') id: string,
    @Body('reference') reference: string,
    @CurrentUser('id') confirmedBy: string,
  ) {
    return this.paymentsService.confirmManual(id, confirmedBy, reference);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('payments/:id/refund')
  @ApiBearerAuth()
  refund(@Param('id') id: string) {
    return this.paymentsService.refund(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/payments')
  @ApiBearerAuth()
  getMyPayments(@CurrentUser('id') userId: string) {
    return this.paymentsService.findByUser(userId);
  }
}
