import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PlayersService } from './players.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List players' })
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
