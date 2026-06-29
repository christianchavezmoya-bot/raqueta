import { Module } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenisChileService } from '../common/integrations/tenischile/tenischile.service';
import { RosterModule } from '../clubs/roster/roster.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClubAnnouncementsModule } from '../club-announcements/club-announcements.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [
    InvitationsModule,
    RosterModule,
    FavoritesModule,
    NotificationsModule,
    ClubAnnouncementsModule,
    MembershipsModule,
  ],
  providers: [PlayersService, TenisChileService],
  controllers: [PlayersController],
  exports: [PlayersService],
})
export class PlayersModule {}
