import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CourtsService } from './courts.service';
import { CreateCourtDto, UpdateCourtDto, CreateCourtPricingDto, CreateCourtBlockDto } from './dto/court.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Courts')
@Controller()
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Public()
  @Get('clubs/:clubId/courts')
  @ApiOperation({ summary: 'List courts for a club' })
  findByClub(@Param('clubId') clubId: string) {
    return this.courtsService.findByClub(clubId);
  }

  @Public()
  @Get('courts/:id')
  @ApiOperation({ summary: 'Get court details' })
  findOne(@Param('id') id: string) {
    return this.courtsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/courts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add court to club' })
  create(@Param('clubId') clubId: string, @Body() dto: CreateCourtDto) {
    return this.courtsService.create(clubId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('courts/:id/photo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload court photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.courtsService.uploadPhoto(id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Patch('courts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update court' })
  update(@Param('id') id: string, @Body() dto: UpdateCourtDto) {
    return this.courtsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @Delete('courts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete court' })
  delete(@Param('id') id: string) {
    return this.courtsService.delete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('courts/:id/pricing')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set court pricing' })
  setPricing(@Param('id') id: string, @Body() dto: CreateCourtPricingDto) {
    return this.courtsService.setPricing(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.RECEPTION)
  @Post('courts/:id/blocks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Block court' })
  createBlock(
    @Param('id') id: string,
    @Body() dto: CreateCourtBlockDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.courtsService.createBlock(id, dto, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Delete('court-blocks/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove court block' })
  deleteBlock(@Param('id') id: string) {
    return this.courtsService.deleteBlock(id);
  }
}
