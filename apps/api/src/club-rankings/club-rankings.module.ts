import { Module } from '@nestjs/common';
import { ClubRankingsController } from './club-rankings.controller';
import { ClubRankingsService } from './club-rankings.service';

@Module({
  controllers: [ClubRankingsController],
  providers: [ClubRankingsService],
  exports: [ClubRankingsService],
})
export class ClubRankingsModule {}
