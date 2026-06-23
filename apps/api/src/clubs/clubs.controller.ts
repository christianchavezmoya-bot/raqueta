import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, Put,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClubsService } from './clubs.service';
import { CreateClubDto, UpdateClubProfileDto } from './dto/create-club.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

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
  @ApiOperation({ summary: 'Create a new club' })
  create(@Body() dto: CreateClubDto, @CurrentUser('id') userId: string) {
    return this.clubsService.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch(':id/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update club profile' })
  updateProfile(@Param('id') id: string, @Body() dto: UpdateClubProfileDto) {
    return this.clubsService.updateProfile(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':id/logo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload club logo' })
  @ApiConsumes('multipart/form-data')
  @uploadInterceptor()
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.clubsService.uploadLogo(id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':id/banner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload club banner' })
  @ApiConsumes('multipart/form-data')
  @uploadInterceptor()
  uploadBanner(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.clubsService.uploadBanner(id, file);
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
    @Body('caption') caption?: string,
  ) {
    return this.clubsService.uploadPhoto(id, file, caption);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Delete(':id/photos/:photoId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete club photo' })
  deletePhoto(@Param('photoId') photoId: string) {
    return this.clubsService.deletePhoto(photoId);
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
  setOpeningHours(@Param('clubId') clubId: string, @Body() body: { hours: any[] }) {
    return this.clubsService.setOpeningHours(clubId, body.hours);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post(':clubId/special-hours')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add special hour/closure' })
  addSpecialHour(@Param('clubId') clubId: string, @Body() body: any) {
    return this.clubsService.addSpecialHour(clubId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Delete(':clubId/special-hours/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete special hour' })
  deleteSpecialHour(@Param('id') id: string) {
    return this.clubsService.deleteSpecialHour(id);
  }
}
