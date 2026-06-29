import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClubMatchResultSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanActForPlayer } from '../common/utils/transact-gate';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clubId?: string) {
    const where: any = clubId ? { clubId } : {};
    return this.prisma.tournament.findMany({
      where,
      include: {
        club: { include: { profile: true } },
        categories: true,
        teams: true,
        _count: { select: { registrations: true, matches: true } },
      },
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
                roster: {
                  include: { linkedPlayerProfile: { select: { id: true, displayName: true, user: { select: { id: true, email: true } } } } },
                },
                team: { include: { player1Roster: true, player2Roster: true } },
              },
              orderBy: { registeredAt: 'asc' },
            },
            teams: { include: { player1Roster: true, player2Roster: true } },
          },
        },
        teams: { include: { player1Roster: true, player2Roster: true } },
        registrations: {
          include: {
            roster: {
              include: { linkedPlayerProfile: { select: { id: true, displayName: true, user: { select: { id: true, email: true } } } },
              },
            },
            team: true,
            category: true,
          },
        },
        matches: {
          include: {
            court: true,
            playerOneRoster: { include: { linkedPlayerProfile: true } },
            playerTwoRoster: { include: { linkedPlayerProfile: true } },
            winnerRoster: { include: { linkedPlayerProfile: true } },
            teamOne: { include: { player1Roster: true, player2Roster: true } },
            teamTwo: { include: { player1Roster: true, player2Roster: true } },
            teamWinner: { include: { player1Roster: true, player2Roster: true } },
            category: true,
          },
          orderBy: [{ bracketStage: 'asc' }, { round: 'asc' }, { scheduledTime: 'asc' }],
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

  /**
   * Register a roster entry for a tournament category. If the optional
   * `forChildUserId` is supplied, register on behalf of that child's profile
   * (staff/parent on behalf of child). Doubles-format tournaments should use
   * `registerTeam` instead.
   */
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
    if (tournament.format === 'DOUBLES' || tournament.format === 'MIXED') {
      throw new BadRequestException(
        'Use POST /tournaments/:id/register-team to register a pair of players for doubles/mixed',
      );
    }

    const { rosterId, registeredByUserId } = await this.resolveRegistrable(
      actorId,
      forChildUserId,
      tournament.clubId,
    );

    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: { tournamentId, categoryId, rosterId, teamId: null },
    });
    if (existing) throw new BadRequestException('Already registered');

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        categoryId,
        rosterId,
        registeredByUserId,
        status: 'PENDING',
        paymentStatus: tournament.price > 0 ? 'PENDING' : 'PAID',
      },
    });
  }

  /**
   * Register a TournamentTeam (pair) for a doubles-format tournament. Both
   * players must be roster entries (an app account is optional for either).
   */
  async registerTeam(
    tournamentId: string,
    categoryId: string,
    actorId: string,
    body: { player1RosterId: string; player2RosterId: string; group?: string; label?: string },
  ) {
    const tournament = await this.ensureExists(tournamentId);
    if (tournament.format !== 'DOUBLES' && tournament.format !== 'MIXED') {
      throw new BadRequestException('register-team is only valid for DOUBLES / MIXED tournaments');
    }

    const team = await this.upsertTeam({
      tournamentId,
      categoryId,
      player1RosterId: body.player1RosterId,
      player2RosterId: body.player2RosterId,
      group: body.group ?? null,
      label: body.label ?? null,
    });

    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: { tournamentId, categoryId, teamId: team.id },
    });
    if (existing) throw new BadRequestException('Team already registered');

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        categoryId,
        rosterId: null,
        teamId: team.id,
        registeredByUserId: actorId,
        status: 'PENDING',
        paymentStatus: tournament.price > 0 ? 'PENDING' : 'PAID',
      },
    });
  }

  /**
   * Create-or-fetch a TournamentTeam, additionally asserting both roster
   * entries belong to this club's pool.
   */
  async upsertTeam(params: {
    tournamentId: string;
    categoryId: string;
    player1RosterId: string;
    player2RosterId: string;
    group?: string | null;
    label?: string | null;
  }) {
    if (params.player1RosterId === params.player2RosterId) {
      throw new BadRequestException('A doubles team must have two distinct players');
    }

    const tournament = await this.ensureExists(params.tournamentId);
    await Promise.all([
      this.assertRosterForClub(tournament.clubId, params.player1RosterId),
      this.assertRosterForClub(tournament.clubId, params.player2RosterId),
    ]);

    const existing = await this.prisma.tournamentTeam.findFirst({
      where: {
        tournamentId: params.tournamentId,
        categoryId:   params.categoryId,
        player1RosterId: params.player1RosterId,
        player2RosterId: params.player2RosterId,
      },
    });
    if (existing) {
      return this.prisma.tournamentTeam.update({
        where: { id: existing.id },
        data: { group: params.group ?? existing.group, label: params.label ?? existing.label },
      });
    }
    return this.prisma.tournamentTeam.create({
      data: {
        tournamentId: params.tournamentId,
        categoryId:   params.categoryId,
        player1RosterId: params.player1RosterId,
        player2RosterId: params.player2RosterId,
        group: params.group ?? undefined,
        label: params.label ?? undefined,
      },
    });
  }

  async generateFixture(tournamentId: string) {
    const tournament = await this.findOne(tournamentId);

    for (const category of tournament.categories) {
      const registrations = tournament.registrations.filter(r => r.categoryId === category.id);

      if (tournament.format === 'DOUBLES' || tournament.format === 'MIXED') {
        const teams = registrations
          .map(r => r.teamId)
          .filter((id): id is string => !!id);
        if (teams.length < 2) continue;
        await this.createTeamMatches(tournamentId, category.id, teams);
        continue;
      }

      const players = registrations
        .map(r => r.rosterId)
        .filter((id): id is string => !!id);
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
    const matches: Prisma.MatchCreateManyInput[] = [];

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      matches.push({
        tournamentId,
        categoryId,
        playerOneRosterId: shuffled[i],
        playerTwoRosterId: shuffled[i + 1],
        round: 'R1',
        bracketStage: 'MAIN',
        status: 'SCHEDULED',
      });
    }

    if (matches.length) await this.prisma.match.createMany({ data: matches });
  }

  private async createTeamMatches(tournamentId: string, categoryId: string, teamIds: string[]) {
    const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
    const matches: Prisma.MatchCreateManyInput[] = [];

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      matches.push({
        tournamentId,
        categoryId,
        teamOneId: shuffled[i],
        teamTwoId: shuffled[i + 1],
        round: 'R1',
        bracketStage: 'MAIN',
        status: 'SCHEDULED',
      });
    }
    if (matches.length) await this.prisma.match.createMany({ data: matches });
  }

  /**
   * Common helper: given an actor and optional forChildUserId, return the
   * rosterId to register and the userId who actually performed the
   * registration (which may differ if a parent/guardian acts on a child's
   * behalf). Creates a roster entry on the fly if needed (same approach as
   * the ClubMatchResult roster migration).
   */
  private async resolveRegistrable(actorId: string, forChildUserId: string | null | undefined, clubId: string) {
    let targetUserId = actorId;
    let actedByUserId: string | null = null;

    if (forChildUserId) {
      const childProfile = await this.prisma.playerProfile.findUnique({
        where: { userId: forChildUserId },
        select: { id: true },
      });
      if (!childProfile) throw new NotFoundException('Child player profile not found');
      await assertCanActForPlayer(actorId, childProfile.id, this.prisma);
      targetUserId = forChildUserId;
      actedByUserId = actorId;
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId: targetUserId },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!profile) {
      throw new BadRequestException(
        'Player profile not found for the user being registered (staff can register a roster-only participant via the admin endpoints, which never touches this flow)',
      );
    }

    // Find or create a roster entry scoped to this club.
    const existingRoster = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, linkedPlayerProfileId: profile.id },
    });
    const rosterId = existingRoster
      ? existingRoster.id
      : (
          await this.prisma.clubPlayerRoster.create({
            data: {
              clubId,
              linkedPlayerProfileId: profile.id,
              firstName: (profile.displayName ?? '').split(' ')[0] || 'Jugador',
              lastName: (profile.displayName ?? '').split(' ').slice(1).join(' ') || '-',
              rut: profile.rut ?? undefined,
              phone: profile.user.phone ?? undefined,
            },
          })
        ).id;

    return { rosterId, registeredByUserId: actedByUserId };
  }

  /**
   * Staff/admin path that registers a roster entry with no app account behind it.
   * Useful when a parent/guardian registers a minor who hasn't yet created an
   * account, or for legacy "paper" registrations. Only managers and above.
   */
  async registerRosterOnly(
    tournamentId: string,
    categoryId: string,
    actorId: string,
    body: { rosterId: string },
  ) {
    const tournament = await this.ensureExists(tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Registration is not open');
    }
    await this.assertRosterForClub(tournament.clubId, body.rosterId);

    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: { tournamentId, categoryId, rosterId: body.rosterId, teamId: null },
    });
    if (existing) throw new BadRequestException('Already registered');

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        categoryId,
        rosterId: body.rosterId,
        registeredByUserId: actorId,
        status: 'PENDING',
        paymentStatus: tournament.price > 0 ? 'PENDING' : 'PAID',
      },
    });
  }

  private async assertRosterForClub(clubId: string, rosterId: string) {
    const entry = await this.prisma.clubPlayerRoster.findFirst({ where: { id: rosterId, clubId } });
    if (!entry) {
      throw new BadRequestException(`Roster entry ${rosterId} does not belong to this club`);
    }
    return entry;
  }

  private async ensureExists(id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }
}
