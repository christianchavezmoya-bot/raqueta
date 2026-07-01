import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChallengesService } from './challenges.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActingUser } from '../common/utils/club-scope';

@ApiTags('Challenges')
@Controller()
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('clubs/:clubId/challenges')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available, pending, incoming, and recent challenges for the current player' })
  list(@Param('clubId') clubId: string, @CurrentUser() actor: ActingUser) {
    return this.challengesService.list(clubId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/challenges')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new challenge against a higher-ranked player in the same division' })
  create(
    @Param('clubId') clubId: string,
    @Body() body: { challengedRosterId: string },
    @CurrentUser() actor: ActingUser,
  ) {
    return this.challengesService.create(clubId, body.challengedRosterId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/challenges/:id/accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an incoming challenge' })
  accept(@Param('clubId') clubId: string, @Param('id') id: string, @CurrentUser() actor: ActingUser) {
    return this.challengesService.accept(clubId, id, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/challenges/:id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject an incoming challenge' })
  reject(@Param('clubId') clubId: string, @Param('id') id: string, @CurrentUser() actor: ActingUser) {
    return this.challengesService.reject(clubId, id, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clubs/:clubId/challenges/:id/result')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit the result of an accepted challenge' })
  submitResult(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() body: { winnerRosterId: string; setScores?: Array<{ winner: number; loser: number }> },
    @CurrentUser() actor: ActingUser,
  ) {
    return this.challengesService.submitResult(clubId, id, body, actor);
  }
}
