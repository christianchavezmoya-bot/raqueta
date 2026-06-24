import { Module } from '@nestjs/common';
import { MatchLogService } from './match-log.service';
import { MatchLogController } from './match-log.controller';

@Module({
  providers: [MatchLogService],
  controllers: [MatchLogController],
  exports: [MatchLogService],
})
export class MatchLogModule {}
