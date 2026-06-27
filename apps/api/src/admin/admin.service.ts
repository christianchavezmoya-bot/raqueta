import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── CLUBS ───────────────────────────────────────────────────────────────────

  async listClubs(page = 1, limit = 20, search?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;

    const [clubs, total] = await Promise.all([
      this.prisma.club.findMany({
        skip,
        take: limit,
        where,
        select: {
          id:          true,
          name:        true,
          slug:        true,
          status:      true,
          trialEndsAt: true,
          createdAt:   true,
          _count: {
            select: {
              rosterEntries: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.club.count({ where }),
    ]);

    // Fetch staff counts separately (users with staffClubId)
    const clubIds = clubs.map(c => c.id);
    const staffCounts = await this.prisma.user.groupBy({
      by: ['staffClubId'],
      where: { staffClubId: { in: clubIds } },
      _count: { _all: true },
    });
    const staffMap = new Map(staffCounts.map(s => [s.staffClubId!, s._count._all]));

    const now = Date.now();
    const data = clubs.map(club => ({
      id:          club.id,
      name:        club.name,
      slug:        club.slug,
      status:      club.status,
      trialEndsAt: club.trialEndsAt,
      trialDaysRemaining: club.trialEndsAt
        ? Math.max(0, Math.ceil((club.trialEndsAt.getTime() - now) / 86400000))
        : null,
      playerCount: club._count.rosterEntries,
      staffCount:  staffMap.get(club.id) ?? 0,
      createdAt:   club.createdAt,
    }));

    return { data, total, page, limit };
  }

  async getClub(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        profile: true,
        photos:  { orderBy: { displayOrder: 'asc' } },
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        courts:  { where: { active: true }, include: { pricing: true } },
        membershipPlans: { where: { active: true } },
        instructors: {
          where: { active: true },
          select: { id: true, name: true, photoUrl: true, bio: true, experienceYears: true, specialties: true },
        },
        _count: {
          select: {
            rosterEntries:   true,
            reservations:    true,
            memberships:     true,
            tournaments:     true,
          },
        },
      },
    });
    if (!club) throw new NotFoundException('Club not found');

    const staffCount = await this.prisma.user.count({ where: { staffClubId: id } });

    return {
      ...club,
      staffCount,
      trialStatus: this.computeTrialStatus(club),
    };
  }

  // ─── PLAYERS ─────────────────────────────────────────────────────────────────

  async listPlayers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { playerProfile: { displayName: { contains: search, mode: 'insensitive' as const } } }
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
          playerProfile: {
            select: {
              id:              true,
              displayName:     true,
              profilePhotoUrl: true,
              level:           true,
              category:        true,
              homeClub:        { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { ...where, playerProfile: { isNot: null } } }),
    ]);

    return { data: users, total, page, limit };
  }

  // ─── STATS ───────────────────────────────────────────────────────────────────

  async getPlatformStats() {
    const [
      totalClubs,
      clubsByStatus,
      totalPlayers,
      newPlayersLast30,
      newClubsLast30,
      trialClubs,
    ] = await Promise.all([
      this.prisma.club.count(),
      this.prisma.club.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.playerProfile.count(),
      this.prisma.playerProfile.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
      this.prisma.club.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
      this.prisma.club.findMany({
        where: { status: 'TRIAL' },
        select: { id: true, name: true, trialEndsAt: true, createdAt: true },
        orderBy: { trialEndsAt: 'asc' },
      }),
    ]);

    const statusMap = Object.fromEntries(clubsByStatus.map(s => [s.status, s._count._all]));
    const activeCount = statusMap['ACTIVE'] ?? 0;
    const trialCount  = statusMap['TRIAL'] ?? 0;
    const lockedCount = statusMap['LOCKED'] ?? 0;
    const conversionRate = (trialCount + activeCount) > 0
      ? Math.round((activeCount / (trialCount + activeCount)) * 100)
      : 0;

    return {
      clubs: {
        total:      totalClubs,
        byStatus:   statusMap,
        newLast30d: newClubsLast30,
        conversionRate,
        trialExpiringSoon: trialClubs
          .filter(c => c.trialEndsAt && c.trialEndsAt.getTime() - Date.now() < 7 * 86400000)
          .map(c => ({
            id:          c.id,
            name:        c.name,
            trialEndsAt: c.trialEndsAt,
            daysRemaining: c.trialEndsAt
              ? Math.max(0, Math.ceil((c.trialEndsAt.getTime() - Date.now()) / 86400000))
              : 0,
          })),
      },
      players: {
        total:      totalPlayers,
        newLast30d: newPlayersLast30,
      },
    };
  }

  private computeTrialStatus(club: { status: string; trialEndsAt: Date | null }) {
    if (club.status !== 'TRIAL') return { expired: false, daysRemaining: null };
    if (!club.trialEndsAt) return { expired: false, daysRemaining: null };
    const ms = club.trialEndsAt.getTime() - Date.now();
    const daysRemaining = Math.ceil(ms / 86400000);
    return { expired: daysRemaining <= 0, daysRemaining: Math.max(0, daysRemaining), endsAt: club.trialEndsAt };
  }
}
