import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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

  @Public()
  @Get(':id/public')
  @ApiOperation({ summary: 'Get public player profile' })
  getPublicProfile(@Param('id') id: string) {
    return this.playersService.findPublicProfile(id);
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
