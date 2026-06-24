import {
  Controller, Get, Post, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MatchLogService, CreateMatchLogDto } from './match-log.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Match Log')
@Controller('players/me/match-log')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchLogController {
  constructor(private readonly matchLogService: MatchLogService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a new match/training/coaching/fitness entry' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateMatchLogDto) {
    return this.matchLogService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my match log entries' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findMine(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.matchLogService.findMine(userId, +page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific match log entry (own only)' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.matchLogService.findOne(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a match log entry (own only)' })
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.matchLogService.delete(userId, id);
  }
}
