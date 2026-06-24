import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './common/email/email.module';
import { MediaModule } from './common/media/media.module';
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
import { InvitationsModule } from './invitations/invitations.module';
import { MatchLogModule } from './match-log/match-log.module';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    EmailModule,
    MediaModule,
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
    InvitationsModule,
    MatchLogModule,
  ],
})
export class AppModule {}
