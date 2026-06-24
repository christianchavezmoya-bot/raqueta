import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
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
        include: { playerProfile: { include: { stats: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { ...where, playerProfile: { isNot: null } } }),
    ]);
    return { data: users.map(u => { const { passwordHash, ...rest } = u; return rest; }), total, page, limit };
  }

  /**
   * Global player discovery search (Stage 3).
   * Enforces: publicVisibility=true, availableForMatch=true.
   * Strips phone numbers always. Strips profile photo URL when showPhotoInSearch=false.
   * Excludes the requester from results.
   */
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
        // Never expose user phone
        user: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const total = await this.prisma.playerProfile.count({ where });

    const sanitized = profiles.map(p => ({
      ...p,
      // Honour showPhotoInSearch at the API level — not just client-side
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
    return this.prisma.playerProfile.update({ where: { userId }, data });
  }

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { playerProfile: { include: { stats: true, homeClub: { include: { profile: true } } } } },
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
}
