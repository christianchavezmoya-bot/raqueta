import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './auth/auth.module';
import { ClubsModule } from './clubs/clubs.module';
import { CourtsModule } from './courts/courts.module';
import { InstructorsModule } from './instructors/instructors.module';
import { PlayersModule } from './players/players.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { MatchesModule } from './matches/matches.module';
import { RankingsModule } from './rankings/rankings.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    EmailModule,
    AuthModule,
    ClubsModule,
    CourtsModule,
    InstructorsModule,
    PlayersModule,
    MembershipsModule,
    ReservationsModule,
    PaymentsModule,
    TournamentsModule,
    MatchesModule,
    RankingsModule,
    CalendarModule,
    NotificationsModule,
    ReportsModule,
  ],
})
export class AppModule {}
