import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { TenisChileService } from '../common/integrations/tenischile/tenischile.service';
import { RosterService } from '../clubs/roster/roster.service';
import { validateAndNormalizeRut } from '../common/utils/rut';

const RUN_REFRESH_HOURS = 24;

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private prisma: PrismaService,
    private media: MediaService,
    private tenisChile: TenisChileService,
    private rosterService: RosterService,
  ) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { playerProfile: { displayName: { contains: search, mode: 'insensitive' as any } } }
      : {};
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        where: { ...where, playerProfile: { isNot: null } },
        include: { playerProfile: { include: { stats: true, homeClub: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { ...where, playerProfile: { isNot: null } } }),
    ]);
    return { data: users.map(u => { const { passwordHash, ...rest } = u; return rest; }), total, page, limit };
  }

  async searchAvailable(requesterId: string, filters: {
    comuna?: string;
    level?: string;
    availableWeekdays?: boolean;
    availableWeekends?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const requesterProfile = await this.prisma.playerProfile.findUnique({
      where: { userId: requesterId },
      select: { id: true },
    });

    const where: any = {
      publicVisibility: true,
      availableForMatch: true,
      ...(filters.comuna ? { comuna: { contains: filters.comuna, mode: 'insensitive' } } : {}),
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.availableWeekdays ? { availableWeekdays: true } : {}),
      ...(filters.availableWeekends ? { availableWeekends: true } : {}),
      ...(requesterProfile ? { NOT: { id: requesterProfile.id } } : {}),
    };

    const profiles = await this.prisma.playerProfile.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        displayName: true,
        profilePhotoUrl: true,
        showPhotoInSearch: true,
        level: true,
        category: true,
        comuna: true,
        availableWeekdays: true,
        availableWeekends: true,
        bio: true,
        homeClub: { select: { id: true, name: true } },
        stats: { select: { matchesPlayed: true, wins: true, rankingPoints: true } },
        user: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const total = await this.prisma.playerProfile.count({ where });

    const sanitized = profiles.map(p => ({
      ...p,
      profilePhotoUrl: p.showPhotoInSearch ? p.profilePhotoUrl : null,
    }));

    return { data: sanitized, total, page, limit };
  }

  async toggleAvailability(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return this.prisma.playerProfile.update({
      where: { userId },
      data: { availableForMatch: !profile.availableForMatch },
      select: { availableForMatch: true },
    });
  }

  async updateAvailabilitySettings(userId: string, data: {
    availableWeekdays?: boolean;
    availableWeekends?: boolean;
    showPhotoInSearch?: boolean;
    availableForMatch?: boolean;
    comuna?: string;
  }) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return this.prisma.playerProfile.update({ where: { userId }, data });
  }

  async linkRunProfile(userId: string, value: string) {
    const profile = await this.requireProfile(userId);
    const playerId = this.tenisChile.parsePlayerId(value);
    if (!playerId) throw new BadRequestException('Enter a valid TenisChile profile URL or numeric RUN player ID');

    let snapshot;
    try {
      snapshot = await this.tenisChile.fetchPlayerRanking(playerId);
    } catch (error) {
      this.logger.warn(`RUN link validation failed for ${playerId}: ${String(error)}`);
      throw new BadGatewayException('Could not verify that RUN profile right now');
    }

    if (!snapshot) {
      throw new BadRequestException('That TenisChile profile could not be found or parsed');
    }

    const updated = await this.prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        runPlayerId: playerId,
        runRankCached: snapshot.rank,
        runPointsCached: snapshot.points,
        runAtpPointsCached: snapshot.atpPoints,
        runLastSyncedAt: new Date(),
      },
    });

    return {
      linked: true,
      profile: this.buildRunProfileResponse(updated, snapshot.name),
      message: 'RUN profile linked successfully',
    };
  }

  async refreshRunProfile(userId: string) {
    const profile = await this.requireProfile(userId);
    if (!profile.runPlayerId) throw new BadRequestException('No RUN profile is linked');

    const nextRefreshAvailableAt = this.getNextRefreshAvailableAt(profile.runLastSyncedAt);
    if (nextRefreshAvailableAt && nextRefreshAvailableAt > new Date()) {
      return {
        linked: true,
        rateLimited: true,
        nextRefreshAvailableAt,
        profile: this.buildRunProfileResponse(profile),
        message: 'RUN profile was refreshed recently. Please try again later.',
      };
    }

    try {
      const snapshot = await this.tenisChile.fetchPlayerRanking(profile.runPlayerId);
      if (!snapshot) {
        return {
          linked: true,
          refreshed: false,
          nextRefreshAvailableAt: null,
          profile: this.buildRunProfileResponse(profile),
          message: 'Could not refresh RUN data right now. Showing the last cached snapshot.',
        };
      }

      const updated = await this.prisma.playerProfile.update({
        where: { id: profile.id },
        data: {
          runRankCached: snapshot.rank,
          runPointsCached: snapshot.points,
          runAtpPointsCached: snapshot.atpPoints,
          runLastSyncedAt: new Date(),
        },
      });

      return {
        linked: true,
        refreshed: true,
        nextRefreshAvailableAt: this.getNextRefreshAvailableAt(updated.runLastSyncedAt),
        profile: this.buildRunProfileResponse(updated, snapshot.name),
        message: 'RUN profile refreshed',
      };
    } catch (error) {
      this.logger.error(`RUN refresh failed for profile ${profile.id}`, error as any);
      return {
        linked: true,
        refreshed: false,
        nextRefreshAvailableAt: null,
        profile: this.buildRunProfileResponse(profile),
        message: 'Could not refresh RUN data right now. Showing the last cached snapshot.',
      };
    }
  }

  async unlinkRunProfile(userId: string) {
    const profile = await this.requireProfile(userId);
    await this.prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        runPlayerId: null,
        runRankCached: null,
        runPointsCached: null,
        runAtpPointsCached: null,
        runLastSyncedAt: null,
      },
    });

    return { linked: false, message: 'RUN profile unlinked' };
  }

  async getMyClubRanking(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { homeClub: { select: { id: true, name: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    if (!profile.homeClubId) return { club: null, entry: null };

    // Find this player's roster entry at their home club
    const rosterEntry = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId: profile.homeClubId, linkedPlayerProfileId: profile.id },
    });
    if (!rosterEntry) return { club: profile.homeClub, entry: null };

    // Active season for the home club
    const activeSeason = await this.prisma.rankingSeason.findFirst({
      where: { clubId: profile.homeClubId, status: 'ACTIVE' },
      select: { id: true },
    });

    const entry = await this.prisma.clubRankingEntry.findFirst({
      where: {
        clubId:   profile.homeClubId,
        rosterId: rosterEntry.id,
        seasonId: activeSeason?.id ?? null,
      },
      include: { club: { select: { id: true, name: true } } },
    });

    return { club: profile.homeClub, entry };
  }

  async findPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        playerProfile: { include: { stats: true, homeClub: { include: { profile: true } } } },
      },
    });
    if (!user || !user.playerProfile) throw new NotFoundException('Player not found');
    if (!user.playerProfile.publicVisibility) throw new NotFoundException('Profile is private');
    const { passwordHash, phone, ...safe } = user;
    return safe;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    const url = await this.media.uploadFixed(file, `players/${userId}/avatar`);
    return this.prisma.playerProfile.update({
      where: { userId },
      data: { profilePhotoUrl: url },
    });
  }

  async updateMyProfile(userId: string, data: any) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');

    const updateData = { ...data };
    if (updateData.rut !== undefined && updateData.rut !== null) {
      updateData.rut = validateAndNormalizeRut(String(updateData.rut));
    }

    const updated = await this.prisma.playerProfile.update({ where: { userId }, data: updateData });

    // Attempt roster auto-link if RUT was updated
    if (updateData.rut) {
      await this.rosterService.attemptRosterLink(profile.id).catch(() => {/* best-effort */});
    }

    return updated;
  }

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        playerProfile: {
          include: {
            stats: true,
            homeClub: { include: { profile: true } },
            rosterLinks: {
              select: {
                id: true,
                clubId: true,
                division: true,
                club: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Player not found');
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async updateRole(userId: string, role: string) {
    const allowed = ['PLAYER', 'MEMBER', 'CASUAL_USER'];
    if (!allowed.includes(role)) throw new ForbiddenException('Cannot assign this role');
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
      select: { id: true, email: true, role: true },
    });
  }

  async getStats(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { stats: true },
    });
    if (!profile) throw new NotFoundException('Player not found');
    return profile.stats;
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  private getNextRefreshAvailableAt(lastSyncedAt: Date | null) {
    if (!lastSyncedAt) return null;
    return new Date(lastSyncedAt.getTime() + RUN_REFRESH_HOURS * 60 * 60 * 1000);
  }

  private buildRunProfileResponse(profile: {
    runPlayerId: string | null;
    runRankCached: number | null;
    runPointsCached: number | null;
    runAtpPointsCached: number | null;
    runLastSyncedAt: Date | null;
  }, name?: string) {
    return {
      runPlayerId: profile.runPlayerId,
      rank: profile.runRankCached,
      points: profile.runPointsCached,
      atpPoints: profile.runAtpPointsCached,
      lastSyncedAt: profile.runLastSyncedAt,
      name: name ?? null,
    };
  }
}
