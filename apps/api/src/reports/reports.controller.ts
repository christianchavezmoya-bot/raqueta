import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
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

  private resolveRange(from?: string, to?: string) {
    const now = new Date();
    return {
      from: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
      to: to ? new Date(to) : now,
    };
  }

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
    const range = this.resolveRange(from, to);
    return this.reportsService.getRevenueReport(
      clubId,
      range.from,
      range.to,
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
    const range = this.resolveRange(from, to);
    return this.reportsService.getCourtUtilizationReport(
      clubId,
      range.from,
      range.to,
    );
  }

  @Get('clubs/:clubId/dashboard/export')
  @ApiOperation({ summary: 'Export dashboard report as PDF' })
  async exportDashboard(
    @Param('clubId') clubId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (format !== 'pdf') {
      return res.status(400).json({ message: 'Only format=pdf is supported' });
    }
    const pdf = await this.reportsService.exportReportPdf(clubId, 'dashboard');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="club-dashboard-${clubId}.pdf"`);
    res.send(pdf);
  }

  @Get('clubs/:clubId/revenue/export')
  @ApiOperation({ summary: 'Export revenue report as PDF' })
  async exportRevenue(
    @Param('clubId') clubId: string,
    @Query('format') format: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    if (format !== 'pdf') {
      return res.status(400).json({ message: 'Only format=pdf is supported' });
    }
    const range = this.resolveRange(from, to);
    const pdf = await this.reportsService.exportReportPdf(clubId, 'revenue', range);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="club-revenue-${clubId}.pdf"`);
    res.send(pdf);
  }

  @Get('clubs/:clubId/memberships/export')
  @ApiOperation({ summary: 'Export membership report as PDF' })
  async exportMemberships(
    @Param('clubId') clubId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (format !== 'pdf') {
      return res.status(400).json({ message: 'Only format=pdf is supported' });
    }
    const pdf = await this.reportsService.exportReportPdf(clubId, 'memberships');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="club-memberships-${clubId}.pdf"`);
    res.send(pdf);
  }

  @Get('clubs/:clubId/court-utilization/export')
  @ApiOperation({ summary: 'Export court utilization report as PDF' })
  async exportCourtUtilization(
    @Param('clubId') clubId: string,
    @Query('format') format: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    if (format !== 'pdf') {
      return res.status(400).json({ message: 'Only format=pdf is supported' });
    }
    const range = this.resolveRange(from, to);
    const pdf = await this.reportsService.exportReportPdf(clubId, 'court-utilization', range);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="club-courts-${clubId}.pdf"`);
    res.send(pdf);
  }
}
