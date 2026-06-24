import { Module } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenisChileService } from '../common/integrations/tenischile/tenischile.service';

@Module({
  imports: [InvitationsModule],
  providers: [PlayersService, TenisChileService],
  controllers: [PlayersController],
  exports: [PlayersService],
})
export class PlayersModule {}
