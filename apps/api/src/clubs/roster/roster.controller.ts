import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RosterService } from './roster.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActingUser } from '../../common/utils/club-scope';
import { PatchRosterEntryDto } from './dto/patch-roster-entry.dto';

@ApiTags('Club Roster')
@Controller('clubs/:clubId/roster')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN, Role.MANAGER)
@ApiBearerAuth()
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Get()
  @ApiOperation({ summary: 'List all roster entries for a club (linked/unlinked status visible)' })
  listRoster(
    @Param('clubId') clubId: string,
    @CurrentUser() actor: ActingUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.rosterService.listRoster(clubId, actor, {
      includeArchived: includeArchived === 'true',
    });
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Import roster from CSV/XLSX. Upserts by RUT when present; rows without a RUT always create new entries.' })
  importRoster(
    @Param('clubId') clubId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.rosterService.importRoster(clubId, file, actor);
  }

  @Patch(':rosterId')
  @ApiOperation({ summary: 'Update a roster entry (fix typos, set RUT, manually link/unlink a player profile)' })
  patchEntry(
    @Param('clubId') clubId: string,
    @Param('rosterId') rosterId: string,
    @Body() dto: PatchRosterEntryDto,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.rosterService.patchEntry(clubId, rosterId, dto, actor);
  }

  @Patch(':rosterId/archive')
  @ApiOperation({ summary: 'Soft-archive a roster entry without deleting historical data' })
  archiveEntry(
    @Param('clubId') clubId: string,
    @Param('rosterId') rosterId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.rosterService.archiveEntry(clubId, rosterId, actor);
  }

  @Patch(':rosterId/restore')
  @ApiOperation({ summary: 'Restore a previously archived roster entry' })
  restoreEntry(
    @Param('clubId') clubId: string,
    @Param('rosterId') rosterId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.rosterService.restoreEntry(clubId, rosterId, actor);
  }

  @Post(':rosterId/withdraw')
  @ApiOperation({ summary: 'Mark a roster member as withdrawn for a season; auto-creates RETIRO_LESION results for all unplayed opponents in the same division' })
  withdraw(
    @Param('clubId') clubId: string,
    @Param('rosterId') rosterId: string,
    @Query('seasonId') seasonId: string,
    @CurrentUser() actor: ActingUser,
  ) {
    return this.rosterService.withdraw(clubId, rosterId, seasonId, actor);
  }
}
