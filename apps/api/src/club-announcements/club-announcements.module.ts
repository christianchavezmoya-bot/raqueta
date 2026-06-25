import { Module } from '@nestjs/common';
import { ClubAnnouncementsService } from './club-announcements.service';
import { ClubAnnouncementsController } from './club-announcements.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [ClubAnnouncementsService],
  controllers: [ClubAnnouncementsController],
})
export class ClubAnnouncementsModule {}
