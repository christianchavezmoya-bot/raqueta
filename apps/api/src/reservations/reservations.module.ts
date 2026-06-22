import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { ClubsModule } from '../clubs/clubs.module';
import { CourtsModule } from '../courts/courts.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [ClubsModule, CourtsModule, MembershipsModule],
  providers: [ReservationsService],
  controllers: [ReservationsController],
  exports: [ReservationsService],
})
export class ReservationsModule {}
