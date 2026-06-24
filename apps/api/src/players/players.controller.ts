import {
  Controller, Delete, Get, Patch, Post, Param, Body, Query,
  UseGuards, UploadedFile, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PlayersService } from './players.service';
import { InvitationsService } from '../invitations/invitations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { LinkRunDto } from './dto/link-run.dto';

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly invitationsService: InvitationsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List players (admin use)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.playersService.findAll(+page, +limit, search);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search available players for match (global, not club-scoped)' })
  @ApiQuery({ name: 'comuna', required: false })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'weekdays', required: false, type: Boolean })
  @ApiQuery({ name: 'weekends', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  searchAvailable(
    @CurrentUser('id') userId: string,
    @Query('comuna') comuna?: string,
    @Query('level') level?: string,
    @Query('weekdays') weekdays?: string,
    @Query('weekends') weekends?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.playersService.searchAvailable(userId, {
      comuna,
      level,
      availableWeekdays: weekdays === 'true',
      availableWeekends: weekends === 'true',
      page: +page,
      limit: +limit,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/availability')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quick-toggle availableForMatch (no body required; flips the flag)' })
  toggleAvailability(@CurrentUser('id') userId: string) {
    return this.playersService.toggleAvailability(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/availability/settings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update detailed availability settings (weekdays/weekends/photo/comuna)' })
  updateAvailabilitySettings(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.playersService.updateAvailabilitySettings(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/run-link')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link my TenisChile RUN profile by ID or URL' })
  linkRunProfile(@CurrentUser('id') userId: string, @Body() dto: LinkRunDto) {
    return this.playersService.linkRunProfile(userId, dto.value);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/run-link/refresh')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh my cached RUN ranking snapshot' })
  refreshRunProfile(@CurrentUser('id') userId: string) {
    return this.playersService.refreshRunProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/run-link')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink my RUN profile and clear cached ranking data' })
  unlinkRunProfile(@CurrentUser('id') userId: string) {
    return this.playersService.unlinkRunProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/club-ranking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my current internal club ranking entry' })
  getMyClubRanking(@CurrentUser('id') userId: string) {
    return this.playersService.getMyClubRanking(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/invitations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my match invitations (sent and received)' })
  getMyInvitations(@CurrentUser('id') userId: string) {
    return this.invitationsService.getMyInvitations(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a match invitation to a player' })
  invite(
    @CurrentUser('id') requesterId: string,
    @Param('id') recipientUserId: string,
    @Body('message') message?: string,
  ) {
    return this.invitationsService.sendInvitation(requesterId, recipientUserId, message);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get player detail (admin)' })
  findById(@Param('id') id: string) {
    return this.playersService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch(':id/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update player role' })
  updateRole(@Param('id') id: string, @Body('role') role: string) {
    return this.playersService.updateRole(id, role);
  }

  @Public()
  @Get(':id/public')
  @ApiOperation({ summary: 'Get public player profile' })
  getPublicProfile(@Param('id') id: string) {
    return this.playersService.findPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload my avatar' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }))
  uploadAvatar(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.playersService.uploadAvatar(userId, file);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my profile' })
  updateMyProfile(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.playersService.updateMyProfile(userId, body);
  }

  @Public()
  @Get(':id/stats')
  @ApiOperation({ summary: 'Get player stats' })
  getStats(@Param('id') id: string) {
    return this.playersService.getStats(id);
  }
}
