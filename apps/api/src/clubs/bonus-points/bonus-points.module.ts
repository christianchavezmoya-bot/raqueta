import { Module } from '@nestjs/common';
import { BonusPointsController } from './bonus-points.controller';
import { BonusPointsService } from './bonus-points.service';

@Module({
  controllers: [BonusPointsController],
  providers: [BonusPointsService],
  exports: [BonusPointsService],
})
export class BonusPointsModule {}
