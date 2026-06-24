import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [EmailModule],
  providers: [ClubsService],
  controllers: [ClubsController],
  exports: [ClubsService],
})
export class ClubsModule {}
