import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InstructorsService } from './instructors.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Instructors')
@Controller()
export class InstructorsController {
  constructor(private readonly instructorsService: InstructorsService) {}

  @Public()
  @Get('clubs/:clubId/instructors')
  findByClub(@Param('clubId') clubId: string) {
    return this.instructorsService.findByClub(clubId);
  }

  @Public()
  @Get('instructors/:id')
  findOne(@Param('id') id: string) {
    return this.instructorsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('clubs/:clubId/instructors')
  @ApiBearerAuth()
  create(@Param('clubId') clubId: string, @Body() body: any) {
    return this.instructorsService.create(clubId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
  @Post('instructors/:id/photo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload instructor photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.instructorsService.uploadPhoto(id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.INSTRUCTOR)
  @Patch('instructors/:id')
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() body: any) {
    return this.instructorsService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @Delete('instructors/:id')
  @ApiBearerAuth()
  delete(@Param('id') id: string) {
    return this.instructorsService.delete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER, Role.INSTRUCTOR)
  @Put('instructors/:id/availability')
  @ApiBearerAuth()
  setAvailability(@Param('id') id: string, @Body() body: { slots: any[] }) {
    return this.instructorsService.setAvailability(id, body.slots);
  }
}
