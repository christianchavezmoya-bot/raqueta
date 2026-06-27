import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanActForPlayer } from '../common/utils/transact-gate';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clubId?: string) {
    const where: any = clubId ? { clubId } : {};
    return this.prisma.tournament.findMany({
      where,
      include: { club: { include: { profile: true } }, categories: true, _count: { select: { registrations: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        club: { include: { profile: true } },
        categories: {
          include: {
            registrations: {
              include: {
                player: { select: { id: true, email: true, playerProfile: true } },
              },
              orderBy: { registeredAt: 'asc' },
            },
          },
        },
        registrations: {
          include: { player: { select: { id: true, email: true, playerProfile: true } }, category: true },
        },
        matches: {
          include: {
            court: true,
            playerOne: { select: { id: true, email: true, playerProfile: true } },
            playerTwo: { select: { id: true, email: true, playerProfile: true } },
            winner: { select: { id: true, email: true, playerProfile: true } },
            category: true,
          },
          orderBy: [{ round: 'asc' }, { scheduledTime: 'asc' }],
        },
      },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async create(clubId: string, data: any, createdBy: string) {
    return this.prisma.tournament.create({
      data: { ...data, clubId, createdBy, status: 'DRAFT' },
      include: { categories: true },
    });
  }

  async update(id: string, data: any) {
    await this.ensureExists(id);
    return this.prisma.tournament.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    return this.prisma.tournament.delete({ where: { id } });
  }

  async addCategory(tournamentId: string, data: any) {
    await this.ensureExists(tournamentId);
    return this.prisma.tournamentCategory.create({ data: { ...data, tournamentId } });
  }

  async register(
    tournamentId: string,
    categoryId: string,
    actorId: string,
    forChildUserId?: string | null,
  ) {
    const tournament = await this.ensureExists(tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Registration is not open');
    }

    let playerId = actorId;
    let actedByUserId: string | null = null;

    if (forChildUserId) {
      const childProfile = await this.prisma.playerProfile.findUnique({
        where: { userId: forChildUserId },
        select: { id: true },
      });
      if (!childProfile) throw new NotFoundException('Child player profile not found');
      await assertCanActForPlayer(actorId, childProfile.id, this.prisma);
      playerId = forChildUserId;
      actedByUserId = actorId;
    }

    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: { tournamentId, categoryId, playerId },
    });
    if (existing) throw new BadRequestException('Already registered');

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        categoryId,
        playerId,
        actedByUserId,
        status: 'PENDING',
        paymentStatus: tournament.price > 0 ? 'PENDING' : 'PAID',
      },
    });
  }

  async generateFixture(tournamentId: string) {
    const tournament = await this.findOne(tournamentId);

    for (const category of tournament.categories) {
      const registrations = tournament.registrations.filter(r =>
        r.categoryId === category.id && r.status === 'CONFIRMED',
      );

      const players = registrations.map(r => r.playerId);
      if (players.length < 2) continue;

      await this.createMatches(tournamentId, category.id, players);
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' },
    });

    return this.findOne(tournamentId);
  }

  private async createMatches(tournamentId: string, categoryId: string, players: string[]) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const matches = [];

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      matches.push({
        tournamentId,
        categoryId,
        playerOneId: shuffled[i],
        playerTwoId: shuffled[i + 1],
        round: 'R1',
        status: 'SCHEDULED' as const,
      });
    }

    if (matches.length > 0) {
      await this.prisma.match.createMany({ data: matches });
    }
  }

  private async ensureExists(id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }
}
