import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('clubs/:clubId/dashboard')
  @ApiOperation({ summary: 'Get club dashboard KPIs' })
  getDashboard(@Param('clubId') clubId: string) {
    return this.reportsService.getDashboardKPIs(clubId);
  }

  @Get('clubs/:clubId/revenue')
  @ApiOperation({ summary: 'Get revenue report' })
  getRevenue(
    @Param('clubId') clubId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getRevenueReport(
      clubId,
      from ? new Date(from) : new Date(new Date().setDate(1)),
      to ? new Date(to) : new Date(),
    );
  }

  @Get('clubs/:clubId/memberships')
  @ApiOperation({ summary: 'Get membership report' })
  getMemberships(@Param('clubId') clubId: string) {
    return this.reportsService.getMembershipReport(clubId);
  }

  @Get('clubs/:clubId/court-utilization')
  @ApiOperation({ summary: 'Get court utilization report' })
  getCourtUtilization(
    @Param('clubId') clubId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getCourtUtilizationReport(
      clubId,
      from ? new Date(from) : new Date(new Date().setDate(1)),
      to ? new Date(to) : new Date(),
    );
  }
}
