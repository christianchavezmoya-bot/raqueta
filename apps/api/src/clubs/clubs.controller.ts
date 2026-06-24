import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, Put,
  UploadedFile, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClubsService } from './clubs.service';
import { CreateClubDto, UpdateClubProfileDto, RegisterClubDto } from './dto/create-club.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ActingUser } from '../common/utils/club-scope';

const uploadInterceptor = () =>
  UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }));

@ApiTags('Clubs')
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active clubs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.clubsService.findAll(+page, +limit);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Self-service club registration with 14-day free trial (no auth required)' })
  registerClub(@Body() dto: RegisterClubDto) {
    return this.clubsService.register(dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get club by ID' })
  findOne(@Param('id') id: string) {
    return this.clubsService.findOne(id);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get club by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.clubsService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new club (staff only)' })
  create(@Body() dto: CreateClubDto, @CurrentUser('id') userId: string) {
    return this.clubsService.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch(':id/unlock')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SUPER_ADMIN: promote club to ACTIVE (manual upgrade / trial end)' })
  unlock(@Param('id') id: string) {
    return this.clubsService.unlock(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch(':id/extend-trial')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SUPER_ADMIN: extend trial by N days (default 14)' })
  extendTrial(@Param('id') id: string, @Body('days') days?: number) {
    return this.clubsService.extendTrial(id, days);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch(':id/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update club profile' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateClubProfileDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubsService.updateProfile(id, dto, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':id/logo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload club logo' })
  @ApiConsumes('multipart/form-data')
  @uploadInterceptor()
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubsService.uploadLogo(id, file, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':id/banner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload club banner' })
  @ApiConsumes('multipart/form-data')
  @uploadInterceptor()
  uploadBanner(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubsService.uploadBanner(id, file, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':id/photos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload club gallery photo' })
  @ApiConsumes('multipart/form-data')
  @uploadInterceptor()
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
    @Body('caption') caption?: string,
  ) {
    return this.clubsService.uploadPhoto(id, file, actor, caption);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Delete(':id/photos/:photoId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete club photo' })
  deletePhoto(@Param('photoId') photoId: string, @CurrentUser() actor: ActingUser) {
    return this.clubsService.deletePhoto(photoId, actor);
  }

  @Public()
  @Get(':clubId/opening-hours')
  @ApiOperation({ summary: 'Get club opening hours' })
  getOpeningHours(@Param('clubId') clubId: string) {
    return this.clubsService.findOne(clubId).then(c => c.openingHours);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Put(':clubId/opening-hours')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set club opening hours' })
  setOpeningHours(
    @Param('clubId') clubId: string,
    @Body() body: { hours: any[] },
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubsService.setOpeningHours(clubId, body.hours, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':clubId/special-hours')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add special hour/closure' })
  addSpecialHour(
    @Param('clubId') clubId: string,
    @Body() body: any,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.clubsService.addSpecialHour(clubId, body, actor);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Delete(':clubId/special-hours/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete special hour' })
  deleteSpecialHour(@Param('id') id: string, @CurrentUser() actor: ActingUser) {
    return this.clubsService.deleteSpecialHour(id, actor);
  }
}
