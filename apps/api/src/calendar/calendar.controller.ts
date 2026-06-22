import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @UseGuards(JwtAuthGuard)
  @Get('user')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user unified calendar' })
  getUserCalendar(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendarService.getUserCalendar(
      userId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('club/:clubId/day')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get club day calendar' })
  getClubDayCalendar(@Param('clubId') clubId: string, @Query('date') date?: string) {
    return this.calendarService.getClubCalendar(clubId, date ? new Date(date) : undefined);
  }
}
