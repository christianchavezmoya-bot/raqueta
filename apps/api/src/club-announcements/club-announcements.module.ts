import { Module } from '@nestjs/common';
import { ClubAnnouncementsService } from './club-announcements.service';
import { ClubAnnouncementsController } from './club-announcements.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [ClubAnnouncementsService],
  controllers: [ClubAnnouncementsController],
  // Export the service so the PlayersModule can re-use it for the player-facing
  // "favorite-announcements" feed without duplicating the audience / category-mute
  // filtering logic.
  exports: [ClubAnnouncementsService],
})
export class ClubAnnouncementsModule {}
