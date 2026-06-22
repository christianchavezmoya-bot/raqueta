import { Module } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';

@Module({
  providers: [RankingsService],
  controllers: [RankingsController],
  exports: [RankingsService],
})
export class RankingsModule {}
