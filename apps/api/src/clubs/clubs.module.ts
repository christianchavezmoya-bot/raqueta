import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { EmailModule } from '../common/email/email.module';
import { RosterModule } from './roster/roster.module';
import { SeasonsModule } from './seasons/seasons.module';
import { BonusPointsModule } from './bonus-points/bonus-points.module';

@Module({
  imports: [EmailModule, RosterModule, SeasonsModule, BonusPointsModule],
  providers: [ClubsService],
  controllers: [ClubsController],
  exports: [ClubsService, RosterModule],
})
export class ClubsModule {}
