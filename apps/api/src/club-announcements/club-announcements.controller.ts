import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClubAnnouncementsService } from './club-announcements.service';
import { CreateClubAnnouncementDto } from './dto/create-club-announcement.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActingUser } from '../common/utils/club-scope';

@ApiTags('Club Announcements')
@Controller('clubs/:id/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClubAnnouncementsController {
  constructor(private readonly service: ClubAnnouncementsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Send a club announcement' })
  create(
    @Param('id') clubId: string,
    @Body() dto: CreateClubAnnouncementDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.service.create(clubId, dto, actor);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List announcement history for a club' })
  findByClub(@Param('id') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.service.findByClub(clubId, actor);
  }
}
