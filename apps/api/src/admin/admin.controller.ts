import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Super Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('clubs')
  @ApiOperation({ summary: 'List all clubs on the platform with counts and trial status' })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  listClubs(
    @Query('page')   page   = '1',
    @Query('limit')  limit  = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listClubs(+page, +limit, search, status);
  }

  @Get('clubs/:id')
  @ApiOperation({ summary: 'Get full club detail (SUPER_ADMIN view — cross-tenant)' })
  getClub(@Param('id') id: string) {
    return this.adminService.getClub(id);
  }

  @Get('players')
  @ApiOperation({ summary: 'Platform-wide authenticated admin player directory' })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'search', required: false })
  listPlayers(
    @Query('page')   page   = '1',
    @Query('limit')  limit  = '20',
    @Query('search') search?: string,
  ) {
    return this.adminService.listPlayers(+page, +limit, search);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide aggregate statistics' })
  getPlatformStats() {
    return this.adminService.getPlatformStats();
  }

  // ─── PLATFORM SETTINGS ───────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get all platform settings (SMTP_PASS masked)' })
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Upsert platform settings; blank/masked SMTP_PASS is ignored' })
  upsertSettings(
    @Body() body: { settings: Array<{ key: string; value: string }> },
    @CurrentUser('id') actorId: string,
  ) {
    return this.adminService.upsertSettings(body.settings, actorId);
  }

  @Post('settings/test-smtp')
  @ApiOperation({ summary: 'Send a test email to verify current SMTP settings' })
  testSmtp(@Body() body: { to: string }) {
    return this.adminService.testSmtp(body.to);
  }
}
