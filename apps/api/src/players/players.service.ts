import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { TenisChileService } from '../common/integrations/tenischile/tenischile.service';
import { RosterService } from '../clubs/roster/roster.service';
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MembershipsService } from '../memberships/memberships.service';
import { validateAndNormalizeRut } from '../common/utils/rut';

const RUN_REFRESH_HOURS = 24;

type PlayerSearchFilters = {
  comuna?: string;
  level?: string;
  availableWeekdays?: boolean;
  availableWeekends?: boolean;
  radiusKm?: number;
  latitude?: number;
  longitude?: number;
  page?: number;
  limit?: number;
};

type SourceKey = 'LADDER' | 'TOURNAMENT' | 'PERSONAL_LOG';

type StatsTrendPoint = {
  month: string;
  source: SourceKey;
  matchesPlayed: number;
  wins: number;
  losses: number;
};

type StatsBreakdownPoint = {
  source: SourceKey;
  bucketType: 'DIVISION' | 'CATEGORY';
  bucketLabel: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
};

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private prisma: PrismaService,
    private media: MediaService,
    private tenisChile: TenisChileService,
    private rosterService: RosterService,
    private favoritesService: FavoritesService,
    private notificationsService: NotificationsService,
    private membershipsService: MembershipsService,
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
        select: {
          id:        true,
          email:     true,
          role:      true,
          status:    true,
          createdAt: true,
          updatedAt: true,
          playerProfile: {
            select: {
              id:             true,
              displayName:    true,
              profilePhotoUrl:true,
              level:          true,
              category:       true,
              homeClub:       { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { ...where, playerProfile: { isNot: null } } }),
    ]);
    return { data: users, total, page, limit };
  }

  async searchAvailable(requesterId: string, filters: PlayerSearchFilters) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;
    const useRadius = filters.radiusKm !== undefined;

    if (useRadius) {
      if (
        filters.radiusKm === undefined
        || filters.latitude === undefined
        || filters.longitude === undefined
      ) {
        throw new BadRequestException('Latitude, longitude, and radiusKm are required for proximity search');
      }
      if (filters.radiusKm <= 0) {
        throw new BadRequestException('radiusKm must be greater than zero');
      }
    }

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

    const baseSelect = {
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
      lastKnownLatitude: true,
      lastKnownLongitude: true,
      homeClub: { select: { id: true, name: true } },
      user: { select: { id: true } },
    } as const;

    if (!useRadius) {
      const [profiles, total] = await Promise.all([
        this.prisma.playerProfile.findMany({
          where,
          skip,
          take: limit,
          select: baseSelect,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.playerProfile.count({ where }),
      ]);

      return {
        data: profiles.map(profile => ({
          ...this.stripLocation(profile),
          profilePhotoUrl: profile.showPhotoInSearch ? profile.profilePhotoUrl : null,
        })),
        total,
        page,
        limit,
      };
    }

    const profiles = await this.prisma.playerProfile.findMany({
      where,
      take: 250,
      select: baseSelect,
      orderBy: { updatedAt: 'desc' },
    });

    const filtered = profiles
      .map(profile => {
        if (profile.lastKnownLatitude === null || profile.lastKnownLongitude === null) return null;
        const distanceKm = this.haversineKm(
          filters.latitude!,
          filters.longitude!,
          profile.lastKnownLatitude,
          profile.lastKnownLongitude,
        );
        if (distanceKm > filters.radiusKm!) return null;
        return {
          ...this.stripLocation(profile),
          profilePhotoUrl: profile.showPhotoInSearch ? profile.profilePhotoUrl : null,
          distanceKm: Number(distanceKm.toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm);

    return {
      data: filtered.slice(skip, skip + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  async toggleAvailability(userId: string, payload: {
    availableForMatch?: boolean;
    latitude?: number;
    longitude?: number;
  } = {}) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');

    const hasLatitude = payload.latitude !== undefined;
    const hasLongitude = payload.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('Latitude and longitude must be provided together');
    }

    const nextAvailable = payload.availableForMatch ?? !profile.availableForMatch;
    const data: any = { availableForMatch: nextAvailable };

    if (nextAvailable) {
      if (hasLatitude && hasLongitude) {
        data.lastKnownLatitude = payload.latitude;
        data.lastKnownLongitude = payload.longitude;
        data.locationUpdatedAt = new Date();
      }
    } else {
      data.lastKnownLatitude = null;
      data.lastKnownLongitude = null;
      data.locationUpdatedAt = null;
    }

    return this.prisma.playerProfile.update({
      where: { userId },
      data,
      select: {
        availableForMatch: true,
        lastKnownLatitude: true,
        lastKnownLongitude: true,
        locationUpdatedAt: true,
      },
    });
  }

  async updateAvailabilitySettings(userId: string, data: {
    availableWeekdays?: boolean;
    availableWeekends?: boolean;
    showPhotoInSearch?: boolean;
    availableForMatch?: boolean;
    comuna?: string;
    publicVisibility?: boolean;
    shareStatsWithClub?: boolean;
    shareStatsWithPlayers?: boolean;
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

    const rosterEntry = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId: profile.homeClubId, linkedPlayerProfileId: profile.id },
    });
    if (!rosterEntry) return { club: profile.homeClub, entry: null };

    const activeSeason = await this.prisma.rankingSeason.findFirst({
      where: { clubId: profile.homeClubId, status: 'ACTIVE' },
      select: { id: true },
    });

    const entry = await this.prisma.clubRankingEntry.findFirst({
      where: {
        clubId: profile.homeClubId,
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
      select: {
        id: true,
        playerProfile: {
          select: {
            id: true,
            displayName: true,
            profilePhotoUrl: true,
            bio: true,
            level: true,
            category: true,
            comuna: true,
            publicVisibility: true,
            shareStatsWithPlayers: true,
            homeClub: {
              select: {
                id: true,
                name: true,
                slug: true,
                profile: { select: { city: true, accentColor: true } },
              },
            },
            stats: true,
          },
        },
      },
    });

    if (!user || !user.playerProfile) throw new NotFoundException('Player not found');
    if (!user.playerProfile.publicVisibility) throw new NotFoundException('Profile is private');

    const detailedStats = user.playerProfile.shareStatsWithPlayers
      ? await this.buildDetailedStats({
          id: user.playerProfile.id,
          userId: user.id,
          displayName: user.playerProfile.displayName,
          stats: user.playerProfile.stats,
        })
      : null;

    return {
      id: user.id,
      playerProfile: {
        id: user.playerProfile.id,
        displayName: user.playerProfile.displayName,
        profilePhotoUrl: user.playerProfile.profilePhotoUrl,
        bio: user.playerProfile.bio,
        level: user.playerProfile.level,
        category: user.playerProfile.category,
        comuna: user.playerProfile.comuna,
        homeClub: user.playerProfile.homeClub,
        statsVisibility: {
          publicVisibility: user.playerProfile.publicVisibility,
          shareStatsWithPlayers: user.playerProfile.shareStatsWithPlayers,
        },
        statsCard: detailedStats
          ? this.buildPlayerStatCard(user.playerProfile.displayName, user.playerProfile.stats, detailedStats)
          : null,
        stats: user.playerProfile.shareStatsWithPlayers ? user.playerProfile.stats : null,
        statsDetail: detailedStats,
      },
    };
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

    // If the player just provided name+DOB, attempt an identity match against
    // every club's roster (NOT RUT — that's sensitive). Surface any new
    // candidates to the player's `GET /players/me/club-matches` feed.
    if (updateData.firstName || updateData.lastName || updateData.dateOfBirth) {
      await this.rosterService.attemptRosterLinkByIdentity(profile.id).catch(() => {});
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
    if (!safe.playerProfile) return safe;

    const detailedStats = safe.playerProfile.shareStatsWithClub
      ? await this.buildDetailedStats({
          id: safe.playerProfile.id,
          userId: safe.id,
          displayName: safe.playerProfile.displayName,
          stats: safe.playerProfile.stats,
        })
      : null;

    return {
      ...safe,
      playerProfile: {
        ...safe.playerProfile,
        statsVisibility: {
          shareStatsWithClub: safe.playerProfile.shareStatsWithClub,
          shareStatsWithPlayers: safe.playerProfile.shareStatsWithPlayers,
        },
        stats: safe.playerProfile.shareStatsWithClub ? safe.playerProfile.stats : null,
        sharedStats: detailedStats,
      },
    };
  }

  async updateRole(
    actorId: string,
    actorRole: string,
    actorStaffClubId: string | null,
    targetUserId: string,
    role: string,
  ) {
    if (actorId === targetUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const validRoles = Object.values(Role) as string[];
    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const elevatedRoles: Role[] = [Role.SUPER_ADMIN, Role.CLUB_ADMIN];
    const staffGrantableRoles: Role[] = [Role.MANAGER, Role.RECEPTION, Role.INSTRUCTOR];
    const demotableRoles: Role[] = [Role.PLAYER, Role.MEMBER, Role.CASUAL_USER, Role.PARENT];

    if (actorRole !== Role.SUPER_ADMIN) {
      if (elevatedRoles.includes(role as Role)) {
        throw new ForbiddenException('Only SUPER_ADMIN can grant elevated roles');
      }
      if (!staffGrantableRoles.includes(role as Role) && !demotableRoles.includes(role as Role)) {
        throw new ForbiddenException('You cannot assign this role');
      }
      if (!actorStaffClubId) {
        throw new ForbiddenException('No club assigned to your account');
      }
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { staffClubId: true, playerProfile: { select: { homeClubId: true } } },
      });
      if (!target) throw new NotFoundException('User not found');
      const targetClubId = target.staffClubId ?? target.playerProfile?.homeClubId ?? null;
      if (targetClubId !== actorStaffClubId) {
        throw new ForbiddenException('Cannot manage users from other clubs');
      }
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: role as Role },
      select: { id: true, email: true, role: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actorId,
        entityType: 'User',
        entityId: targetUserId,
        action: 'UPDATE_ROLE',
        oldValue: { role: target.role },
        newValue: { role: updated.role },
      },
    });

    return updated;
  }

  async getStats(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        shareStatsWithPlayers: true,
        stats: true,
      },
    });
    if (!profile) throw new NotFoundException('Player not found');
    if (!profile.shareStatsWithPlayers) {
      return { shared: false, stats: null, statsCard: null, trends: [], divisionBreakdown: [], bySource: [] };
    }

    const detailedStats = await this.buildDetailedStats(profile);
    return {
      shared: true,
      stats: profile.stats,
      statsCard: this.buildPlayerStatCard(profile.displayName, profile.stats, detailedStats),
      ...detailedStats,
    };
  }

  async getMyStats(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        stats: true,
      },
    });
    if (!profile) throw new NotFoundException('Player not found');

    const detailedStats = await this.buildDetailedStats(profile);
    return {
      shared: true,
      stats: profile.stats,
      statsCard: this.buildPlayerStatCard(profile.displayName, profile.stats, detailedStats),
      ...detailedStats,
    };
  }

  async getHeadToHead(userId: string, opponentUserId: string) {
    const [player, opponent] = await Promise.all([
      this.prisma.playerProfile.findUnique({
        where: { userId },
        select: { id: true, userId: true, displayName: true, shareStatsWithPlayers: true },
      }),
      this.prisma.playerProfile.findUnique({
        where: { userId: opponentUserId },
        select: { id: true, userId: true, displayName: true },
      }),
    ]);

    if (!player || !opponent) throw new NotFoundException('Player not found');
    if (!player.shareStatsWithPlayers) {
      throw new NotFoundException('Player stats are private');
    }

    // Resolve any roster entries for either user (across clubs) so we can locate
    // tournament-level matches now that Match references roster entries, not User.
    const [playerRosters, opponentRosters] = await Promise.all([
      this.prisma.clubPlayerRoster.findMany({ where: { linkedPlayerProfileId: player.id }, select: { id: true } }),
      this.prisma.clubPlayerRoster.findMany({ where: { linkedPlayerProfileId: opponent.id }, select: { id: true } }),
    ]);
    const playerRosterIds   = playerRosters.map(r => r.id);
    const opponentRosterIds = opponentRosters.map(r => r.id);

    const [ladderMatches, tournamentMatches, personalLogs] = await Promise.all([
      this.prisma.clubMatchResult.findMany({
        where: {
          OR: [
            {
              AND: [
                { winnerRoster: { is: { linkedPlayerProfileId: player.id } } },
                { loserRoster: { is: { linkedPlayerProfileId: opponent.id } } },
              ],
            },
            {
              AND: [
                { winnerRoster: { is: { linkedPlayerProfileId: opponent.id } } },
                { loserRoster: { is: { linkedPlayerProfileId: player.id } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          recordedAt: true,
          categoryKey: true,
          winnerRoster: { select: { linkedPlayerProfileId: true } },
        },
      }),
      this.prisma.match.findMany({
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.WALKOVER] },
          OR: [
            {
              AND: [
                { playerOneRosterId: { in: playerRosterIds } },
                { playerTwoRosterId: { in: opponentRosterIds } },
              ],
            },
            {
              AND: [
                { playerOneRosterId: { in: opponentRosterIds } },
                { playerTwoRosterId: { in: playerRosterIds } },
              ],
            },
          ],
        },
        select: {
          id: true,
          scheduledTime: true,
          updatedAt: true,
          winnerRoster: { select: { linkedPlayerProfileId: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.matchLogEntry.findMany({
        where: {
          type: 'MATCH',
          OR: [
            { playerId: player.id, opponentId: opponent.id },
            { playerId: opponent.id, opponentId: player.id },
          ],
        },
        select: {
          id: true,
          date: true,
          playerId: true,
          playerWon: true,
        },
      }),
    ]);

    const sourceTotals = new Map<SourceKey, { source: SourceKey; matchesPlayed: number; wins: number; losses: number }>();
    const meetings: Array<{ id: string; source: SourceKey; playedAt: Date; result: 'WIN' | 'LOSS' | 'UNKNOWN'; label: string }> = [];

    const addMeeting = (
      source: SourceKey,
      id: string,
      playedAt: Date,
      didWin: boolean | null,
      label: string,
    ) => {
      const current = sourceTotals.get(source) ?? { source, matchesPlayed: 0, wins: 0, losses: 0 };
      current.matchesPlayed += 1;
      if (didWin === true) current.wins += 1;
      if (didWin === false) current.losses += 1;
      sourceTotals.set(source, current);
      meetings.push({
        id,
        source,
        playedAt,
        result: didWin === true ? 'WIN' : didWin === false ? 'LOSS' : 'UNKNOWN',
        label,
      });
    };

    for (const match of ladderMatches) {
      addMeeting(
        'LADDER',
        match.id,
        match.recordedAt,
        match.winnerRoster?.linkedPlayerProfileId === player.id,
        match.categoryKey ?? 'Ladder',
      );
    }

    for (const match of tournamentMatches) {
      addMeeting(
        'TOURNAMENT',
        match.id,
        match.scheduledTime ?? match.updatedAt,
        match.winnerRoster ? match.winnerRoster.linkedPlayerProfileId === player.id : null,
        match.category?.name ?? 'Torneo',
      );
    }

    for (const match of personalLogs) {
      const didWin = match.playerWon === null
        ? null
        : match.playerId === player.id
          ? match.playerWon
          : !match.playerWon;
      addMeeting('PERSONAL_LOG', match.id, match.date, didWin, 'Registro personal');
    }

    const totals = Array.from(sourceTotals.values()).reduce(
      (acc, item) => ({
        matchesPlayed: acc.matchesPlayed + item.matchesPlayed,
        wins: acc.wins + item.wins,
        losses: acc.losses + item.losses,
      }),
      { matchesPlayed: 0, wins: 0, losses: 0 },
    );

    return {
      player: { id: player.userId, displayName: player.displayName },
      opponent: { id: opponent.userId, displayName: opponent.displayName },
      total: totals,
      bySource: Array.from(sourceTotals.values()),
      meetings: meetings.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime()),
    };
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  private async buildDetailedStats(profile: {
    id: string;
    userId: string;
    displayName: string;
    stats?: any;
  }) {
    const profileRosters = await this.prisma.clubPlayerRoster.findMany({
      where: { linkedPlayerProfileId: profile.id },
      select: { id: true },
    });
    const profileRosterIds = profileRosters.map(r => r.id);

    const [ladderMatches, tournamentMatches, personalLogs] = await Promise.all([
      this.prisma.clubMatchResult.findMany({
        where: {
          OR: [
            { winnerRoster: { is: { linkedPlayerProfileId: profile.id } } },
            { loserRoster: { is: { linkedPlayerProfileId: profile.id } } },
          ],
        },
        select: {
          id: true,
          recordedAt: true,
          categoryKey: true,
          winnerRoster: { select: { linkedPlayerProfileId: true, division: true } },
          loserRoster: { select: { linkedPlayerProfileId: true, division: true } },
        },
      }),
      this.prisma.match.findMany({
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.WALKOVER] },
          OR: [
            { playerOneRosterId: { in: profileRosterIds } },
            { playerTwoRosterId: { in: profileRosterIds } },
            { winnerRoster:  { is: { linkedPlayerProfileId: profile.id } } },
          ],
        },
        select: {
          id: true,
          scheduledTime: true,
          updatedAt: true,
          winnerRoster: { select: { linkedPlayerProfileId: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.matchLogEntry.findMany({
        where: {
          type: 'MATCH',
          OR: [{ playerId: profile.id }, { opponentId: profile.id }],
        },
        select: {
          id: true,
          date: true,
          playerId: true,
          playerWon: true,
        },
      }),
    ]);

    const trendMap = new Map<string, StatsTrendPoint>();
    const breakdownMap = new Map<string, StatsBreakdownPoint>();
    const bySource = new Map<SourceKey, { source: SourceKey; matchesPlayed: number; wins: number; losses: number }>();

    const addTrend = (source: SourceKey, playedAt: Date, didWin: boolean | null) => {
      const month = this.toMonthKey(playedAt);
      const key = `${source}:${month}`;
      const current = trendMap.get(key) ?? { month, source, matchesPlayed: 0, wins: 0, losses: 0 };
      current.matchesPlayed += 1;
      if (didWin === true) current.wins += 1;
      if (didWin === false) current.losses += 1;
      trendMap.set(key, current);

      const sourceTotal = bySource.get(source) ?? { source, matchesPlayed: 0, wins: 0, losses: 0 };
      sourceTotal.matchesPlayed += 1;
      if (didWin === true) sourceTotal.wins += 1;
      if (didWin === false) sourceTotal.losses += 1;
      bySource.set(source, sourceTotal);
    };

    const addBreakdown = (
      source: SourceKey,
      bucketType: 'DIVISION' | 'CATEGORY',
      bucketLabel: string,
      didWin: boolean | null,
    ) => {
      const key = `${source}:${bucketType}:${bucketLabel}`;
      const current = breakdownMap.get(key) ?? {
        source,
        bucketType,
        bucketLabel,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
      };
      current.matchesPlayed += 1;
      if (didWin === true) current.wins += 1;
      if (didWin === false) current.losses += 1;
      breakdownMap.set(key, current);
    };

    for (const match of ladderMatches) {
      const didWin = match.winnerRoster?.linkedPlayerProfileId === profile.id
        ? true
        : match.loserRoster?.linkedPlayerProfileId === profile.id
          ? false
          : null;
      const bucketLabel = match.winnerRoster?.division ?? match.loserRoster?.division ?? match.categoryKey ?? 'Sin división';
      addTrend('LADDER', match.recordedAt, didWin);
      addBreakdown('LADDER', 'DIVISION', bucketLabel, didWin);
    }

    for (const match of tournamentMatches) {
      const playedAt = match.scheduledTime ?? match.updatedAt;
      const didWin = match.winnerRoster
        ? match.winnerRoster.linkedPlayerProfileId === profile.id
        : null;
      addTrend('TOURNAMENT', playedAt, didWin);
      addBreakdown('TOURNAMENT', 'CATEGORY', match.category?.name ?? 'Torneo', didWin);
    }

    for (const match of personalLogs) {
      const didWin = match.playerWon === null
        ? null
        : match.playerId === profile.id
          ? match.playerWon
          : !match.playerWon;
      addTrend('PERSONAL_LOG', match.date, didWin);
      addBreakdown('PERSONAL_LOG', 'CATEGORY', 'Registro personal', didWin);
    }

    return {
      bySource: Array.from(bySource.values()),
      trends: Array.from(trendMap.values()).sort((a, b) => a.month.localeCompare(b.month) || a.source.localeCompare(b.source)),
      divisionBreakdown: Array.from(breakdownMap.values()).sort((a, b) => {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        return b.matchesPlayed - a.matchesPlayed || a.bucketLabel.localeCompare(b.bucketLabel);
      }),
    };
  }

  private buildPlayerStatCard(displayName: string, stats: any, detailedStats: {
    bySource: Array<{ source: SourceKey; matchesPlayed: number; wins: number; losses: number }>;
    trends: StatsTrendPoint[];
  }) {
    return {
      title: `${displayName} · Estadísticas`,
      summary: {
        matchesPlayed: stats?.matchesPlayed ?? 0,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        rankingPoints: stats?.rankingPoints ?? 0,
        currentRank: stats?.currentRank ?? null,
        winRate: stats?.matchesPlayed
          ? Math.round(((stats?.wins ?? 0) / Math.max(stats.matchesPlayed, 1)) * 100)
          : 0,
      },
      bySource: detailedStats.bySource,
      recentTrend: detailedStats.trends.slice(-6),
    };
  }

  private stripLocation(profile: {
    lastKnownLatitude?: number | null;
    lastKnownLongitude?: number | null;
    [key: string]: any;
  }) {
    const { lastKnownLatitude, lastKnownLongitude, ...safe } = profile;
    return safe;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private toMonthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
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

  // ─── Stage 15: club affiliations ────────────────────────────────────────────

  /**
   * Returns a unified view of the player's club affiliations. Used by the
   * mobile home page to render:
   *   - rosterMatches[]   clubs where the player appears in the roster
   *                       (by name+DOB) but hasn't yet confirmed the link
   *   - linkedClubs[]    clubs where the player is confirmed linked
   *   - memberships[]     active paid memberships
   *   - favorites[]       casual-tier fans of clubs
   *   - homeClub          current home club (null if not set)
   *
   * RUT is intentionally never read here.
   */
  async getMyAffiliations(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        homeClub: { include: { profile: true } },
        rosterLinks: {
          include: { club: { include: { profile: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!profile) throw new NotFoundException('Player profile not found');

    const rosterMatches = await this.rosterService.findIdentityMatches(profile.id);

    const memberships = await this.prisma.membership.findMany({
      where: { rosterId: { in: profile.rosterLinks.map(r => r.id) }, status: 'ACTIVE' },
      include: { plan: true, club: { include: { profile: true } } },
    });

    const favorites = await this.prisma.clubFavorite.findMany({
      where: { userId },
      include: { club: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const linkedClubs = profile.rosterLinks.map(link => {
      const hasActiveMembership = memberships.some(m => m.rosterId === link.id);
      return {
        rosterId: link.id,
        clubId:   link.clubId,
        clubName: link.club.name,
        club:     link.club,
        tier:     hasActiveMembership ? 'MEMBER' : 'CASUAL',
      };
    });

    return {
      homeClub: profile.homeClub
        ? { id: profile.homeClub.id, name: profile.homeClub.name, profile: profile.homeClub.profile }
        : null,
      rosterMatches: rosterMatches.map(m => ({
        rosterId: m.rosterId,
        clubId:   m.clubId,
        clubName: m.clubName,
        firstName: m.firstName,
        lastName:  m.lastName,
        dateOfBirth: m.dateOfBirth,
        division:  m.division,
      })),
      linkedClubs,
      memberships: memberships.map(m => ({
        id: m.id,
        clubId: m.clubId,
        clubName: m.club.name,
        planId: m.planId,
        planName: m.plan.name,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      favorites: favorites.map(f => ({
        id: f.id,
        clubId: f.clubId,
        clubName: f.club.name,
        clubProfile: f.club.profile,
      })),
    };
  }

  async confirmRosterMatch(userId: string, rosterId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const entry = await this.prisma.clubPlayerRoster.findUnique({
      where: { id: rosterId },
      include: { club: true },
    });
    if (!entry) throw new NotFoundException('Roster entry not found');

    if (
      profile.firstName !== entry.firstName ||
      profile.lastName !== entry.lastName ||
      !sameDate(profile.dateOfBirth, entry.dateOfBirth)
    ) {
      throw new BadRequestException(
        'Tu perfil actual no coincide con este jugador del roster. ' +
        'Actualiza tu nombre o fecha de nacimiento primero.',
      );
    }

    await this.rosterService.linkProfileToRoster(rosterId, profile.id);

    await this.notificationsService
      .send(
        userId,
        'Vinculado a ' + entry.club.name,
        `Te vinculaste al roster de ${entry.club.name}. Ahora puedes ver tu historial, posiciones y torneos del club en la app.`,
        'GENERAL',
      )
      .catch(() => {});

    return { linked: true, rosterId, clubId: entry.clubId, clubName: entry.club.name };
  }

  async setHomeClub(userId: string, clubId: string | null) {
    if (clubId) {
      const exists = await this.prisma.club.findUnique({ where: { id: clubId } });
      if (!exists) throw new BadRequestException('Club not found');
    }
    const updated = await this.prisma.playerProfile.update({
      where: { userId },
      data: { homeClubId: clubId },
    });
    return { homeClubId: updated.homeClubId };
  }

  async joinClub(
    userId: string,
    clubId: string,
    body: { tier: 'CASUAL' | 'MEMBER'; planId?: string },
  ) {
    if (body.tier !== 'CASUAL' && body.tier !== 'MEMBER') {
      throw new BadRequestException("tier debe ser 'CASUAL' o 'MEMBER'");
    }
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { profile: true },
    });
    if (!club) throw new NotFoundException('Club not found');

    if (body.tier === 'CASUAL') {
      const { created } = await this.favoritesService.favorite(userId, clubId);
      const staffIds = await this.prisma.user.findMany({
        where: {
          OR: [
            { staffClubId: clubId },
            // Use a raw relation via ownedClubs to find club owners
          ],
        },
        select: { id: true },
      });
      for (const s of staffIds) {
        await this.notificationsService
          .send(
            s.id,
            'Nuevo socio casual en ' + club.name,
            `${profile.displayName} se unió como socio casual. Recibirá anuncios prioritarios del club.`,
            'GENERAL',
          )
          .catch(() => {});
      }
      return { tier: 'CASUAL', clubId, clubName: club.name, favorite: { created } };
    }

    // tier=MEMBER: create a MembershipRequest via the existing service.
    if (!body.planId) {
      throw new BadRequestException('Para unirte como socio debes elegir un plan (planId).');
    }
    const membershipRequest = await this.membershipsService.createMembershipRequest(
      clubId,
      userId,
      { planId: body.planId },
    );
    return { tier: 'MEMBER', clubId, clubName: club.name, membershipRequest };
  }
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

