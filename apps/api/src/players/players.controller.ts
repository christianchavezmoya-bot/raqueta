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
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClubAnnouncementsService } from '../club-announcements/club-announcements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { LinkRunDto } from './dto/link-run.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateNotificationPreferencesDto } from '../notifications/dto/update-notification-preferences.dto';

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly invitationsService: InvitationsService,
    private readonly favoritesService: FavoritesService,
    private readonly notificationsService: NotificationsService,
    private readonly clubAnnouncementsService: ClubAnnouncementsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all players — SUPER_ADMIN only' })
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
  @ApiQuery({ name: 'radiusKm', required: false, type: Number })
  @ApiQuery({ name: 'latitude', required: false, type: Number })
  @ApiQuery({ name: 'longitude', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  searchAvailable(
    @CurrentUser('id') userId: string,
    @Query('comuna') comuna?: string,
    @Query('level') level?: string,
    @Query('weekdays') weekdays?: string,
    @Query('weekends') weekends?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.playersService.searchAvailable(userId, {
      comuna,
      level,
      availableWeekdays: weekdays === 'true',
      availableWeekends: weekends === 'true',
      radiusKm: radiusKm ? +radiusKm : undefined,
      latitude: latitude ? +latitude : undefined,
      longitude: longitude ? +longitude : undefined,
      page: +page,
      limit: +limit,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/availability')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle or explicitly set availableForMatch, optionally sending a live location snapshot' })
  toggleAvailability(@CurrentUser('id') userId: string, @Body() body: UpdateAvailabilityDto) {
    return this.playersService.toggleAvailability(userId, body ?? {});
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
  @Get('me/favorites')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List clubs I have favorited (newest first). Available to any player.',
  })
  listMyFavorites(@CurrentUser('id') userId: string) {
    return this.favoritesService.listForPlayer(userId);
  }

  // ─── Stage 15: club affiliations (player-driven) ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/affiliations')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Unified view of my club affiliations: roster matches (name+DOB), ' +
      'linked clubs (MEMBER/CASUAL tier), active memberships, favorites, ' +
      'and current home club. RUT is intentionally never used.',
  })
  getMyAffiliations(@CurrentUser('id') userId: string) {
    return this.playersService.getMyAffiliations(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/tournaments')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Tournaments I am registered in, across all clubs. ' +
      'Excludes DRAFT and CANCELLED. Does NOT include open tournaments the player ' +
      'has not joined — discovery is handled via GET /tournaments?clubId=.',
  })
  getMyTournaments(@CurrentUser('id') userId: string) {
    return this.playersService.findMyTournaments(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/club-matches/:rosterId/confirm')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm "yes, I am the person on this roster entry" — links me in. ' +
      'Identity is verified server-side by name+DOB; RUT is not used.',
  })
  confirmRosterMatch(
    @CurrentUser('id') userId: string,
    @Param('rosterId') rosterId: string,
  ) {
    return this.playersService.confirmRosterMatch(userId, rosterId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/home-club')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set my home club (pass null to clear)' })
  setHomeClub(@CurrentUser('id') userId: string, @Body('clubId') clubId: string | null) {
    return this.playersService.setHomeClub(userId, clubId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/join')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Join a club as Casual (free, priority notifications) or as Member " +
      "(creates a MembershipRequest that staff must approve).",
  })
  joinClub(
    @CurrentUser('id') userId: string,
    @Param('clubId') clubId: string,
    @Body() body: { tier: 'CASUAL' | 'MEMBER'; planId?: string },
  ) {
    return this.playersService.joinClub(userId, clubId, body);
  }

  /**
   * Mobile-Home announcement carousel source. Returns the most-recent
   * announcement for each club the player has favorited, already filtered
   * through PlayerNotificationPreference so a muted category won't surface.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/favorite-announcements')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Most-recent announcement per favorited club, category-mute aware. ' +
      'Drives the mobile Home carousel. One entry per favorited club; ' +
      'clubs with no announcements or a muted category are omitted.',
  })
  listMyFavoriteAnnouncements(@CurrentUser('id') userId: string) {
    return this.clubAnnouncementsService.feedForFavorites(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/notification-preferences')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Read my per-category notification preferences (events / offers / ' +
      'membership offers / match finding). Returns all-TRUE defaults if the ' +
      'row has never been written.',
  })
  getMyNotificationPreferences(@CurrentUser('id') userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/notification-preferences')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Update my per-category notification preferences. Partial updates are ' +
      'supported — omitted fields keep their current value. Only affects ' +
      'category-muted announcements; transactional notifications ' +
      '(bookings, 2FA codes, payment confirmations, direct match ' +
      'invitations, parent/child approvals, role changes) are unaffected.',
  })
  updateMyNotificationPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a match invitation (optionally on behalf of a linked child via forChildUserId)' })
  invite(
    @CurrentUser('id') actorId: string,
    @Param('id') recipientUserId: string,
    @Body('message') message?: string,
    @Body('forChildUserId') forChildUserId?: string,
  ) {
    return this.invitationsService.sendInvitation(actorId, recipientUserId, message, forChildUserId ?? null);
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
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @Patch(':id/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update player role — SUPER_ADMIN (any role) or CLUB_ADMIN (staff roles, own club only)' })
  updateRole(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('staffClubId') actorStaffClubId: string | undefined,
    @Param('id') targetUserId: string,
    @Body('role') role: string,
  ) {
    return this.playersService.updateRole(
      actorId,
      actorRole,
      actorStaffClubId ?? null,
      targetUserId,
      role,
    );
  }

  @Public()
  @Get(':id/head-to-head/:opponentId')
  @ApiOperation({ summary: 'Get head-to-head record for a player against a specific opponent' })
  getHeadToHead(@Param('id') id: string, @Param('opponentId') opponentId: string) {
    return this.playersService.getHeadToHead(id, opponentId);
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

  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my full player statistics' })
  getMyStats(@CurrentUser('id') userId: string) {
    return this.playersService.getMyStats(userId);
  }

  @Public()
  @Get(':id/stats')
  @ApiOperation({ summary: 'Get player stats' })
  getStats(@Param('id') id: string) {
    return this.playersService.getStats(id);
  }
}
