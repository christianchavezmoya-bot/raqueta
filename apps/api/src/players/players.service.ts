import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService) {}

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

  async findPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        playerProfile: { include: { stats: true, homeClub: { include: { profile: true } } } },
      },
    });
    if (!user || !user.playerProfile) throw new NotFoundException('Player not found');
    if (!user.playerProfile.publicVisibility) throw new NotFoundException('Profile is private');
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async updateMyProfile(userId: string, data: any) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return this.prisma.playerProfile.update({ where: { userId }, data });
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
