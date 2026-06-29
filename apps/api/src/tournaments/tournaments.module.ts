import { Module } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentImportService } from './tournament-import.service';
import { TournamentExportService } from './tournament-export.service';
import { TournamentTemplateService } from './tournament-template.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [
    TournamentsService,
    TournamentImportService,
    TournamentExportService,
    TournamentTemplateService,
  ],
  controllers: [TournamentsController],
  exports: [TournamentsService],
})
export class TournamentsModule {}
