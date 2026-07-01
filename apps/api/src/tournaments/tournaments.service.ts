import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubMatchResultSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertCanActForPlayer } from '../common/utils/transact-gate';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { PROMOTE_COUNT, RELEGATE_COUNT } from '../clubs/seasons/seasons.service';

@Injectable()
export class TournamentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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
                team: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
              },
              orderBy: { registeredAt: 'asc' },
            },
            teams: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
          },
        },
        teams: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
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
            teamOne: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
            teamTwo: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
            teamWinner: { include: { player1Roster: this.rosterLiteInclude(), player2Roster: this.rosterLiteInclude() } },
            category: true,
          },
          orderBy: [{ bracketStage: 'asc' }, { round: 'asc' }, { scheduledTime: 'asc' }],
        },
      },
    });
    if (!t) throw new NotFoundException('Tournament not found');

    // Stamp `memberships` (active memberships at this club only) onto every
    // roster entry referenced anywhere in the tournament tree so the web UI
    // can compute the SOCIO / CASUAL / EXTERNO / SIN VINCULAR classification
    // client-side without an extra round-trip.
    await this.stampClubMemberships(t);

    return t;
  }

  /**
   * Minimal roster include used inside team embeds.
   */
  private rosterLiteInclude() {
    return {
      include: {
        linkedPlayerProfile: { select: { id: true, displayName: true, user: { select: { id: true, email: true } } } },
      },
    } as const;
  }

  /**
   * Walk a tournament-shaped result (from `findOne`) and stamp each unique
   * roster object with an `memberships` array containing only this club's
   * ACTIVE memberships for that roster. Idempotent; safe to call on any
   * object that follows the include shape.
   */
  private async stampClubMemberships(t: any) {
    if (!t) return;
    const clubId = t.clubId as string;
    const rosterIds = new Set<string>();
    const visit = (roster: any) => {
      if (roster?.id) rosterIds.add(roster.id);
    };
    (t.registrations ?? []).forEach((r: any) => visit(r.roster));
    (t.matches ?? []).forEach((m: any) => {
      visit(m.playerOneRoster);
      visit(m.playerTwoRoster);
      visit(m.winnerRoster);
      visit(m.teamOne?.player1Roster);
      visit(m.teamOne?.player2Roster);
      visit(m.teamTwo?.player1Roster);
      visit(m.teamTwo?.player2Roster);
    });
    (t.categories ?? []).forEach((cat: any) =>
      (cat.registrations ?? []).forEach((reg: any) => {
        visit(reg.roster);
        visit(reg.team?.player1Roster);
        visit(reg.team?.player2Roster);
      }),
    );

    if (!rosterIds.size) return;
    const memberships = await this.prisma.membership.findMany({
      where: { clubId, status: 'ACTIVE', rosterId: { in: Array.from(rosterIds) } },
      select: { id: true, rosterId: true, status: true },
    });
    const byRoster = new Map<string, Array<{ id: string; status: string }>>();
    for (const m of memberships) {
      const arr = byRoster.get(m.rosterId) ?? [];
      arr.push({ id: m.id, status: m.status });
      byRoster.set(m.rosterId, arr);
    }
    const stamp = (roster: any) => {
      if (!roster?.id) return;
      roster.memberships = byRoster.get(roster.id) ?? [];
    };
    (t.registrations ?? []).forEach((r: any) => stamp(r.roster));
    (t.matches ?? []).forEach((m: any) => {
      stamp(m.playerOneRoster);
      stamp(m.playerTwoRoster);
      stamp(m.winnerRoster);
      stamp(m.teamOne?.player1Roster);
      stamp(m.teamOne?.player2Roster);
      stamp(m.teamTwo?.player1Roster);
      stamp(m.teamTwo?.player2Roster);
    });
    (t.categories ?? []).forEach((cat: any) =>
      (cat.registrations ?? []).forEach((reg: any) => {
        stamp(reg.roster);
        stamp(reg.team?.player1Roster);
        stamp(reg.team?.player2Roster);
      }),
    );
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

  /**
   * Part C — Staff opens registration and notifies all home-club players who
   * haven't yet registered. Only players with active memberships in the
   * tournament's own club are targeted (home-club first rule).
   * Idempotent: duplicate calls skip already-notified players.
   *
   * `customMessage` (optional): if provided, used as the push body. If absent,
   * falls back to the default "Las inscripciones para {name} están abiertas"
   * copy that the mobile app already knows about.
   */
  async notifyOpen(tournamentId: string, customMessage?: string) {
    const tournament = await this.ensureExists(tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Set tournament status to REGISTRATION_OPEN first');
    }

    // Find all active members of this club who have a linked user account
    const members = await this.prisma.membership.findMany({
      where: {
        clubId: tournament.clubId,
        status: 'ACTIVE',
        roster: { linkedPlayerProfile: { userId: { not: null } } },
      },
      include: {
        roster: {
          include: {
            linkedPlayerProfile: { select: { userId: true } },
          },
        },
      },
    });

    // Find user IDs who are already registered
    const existing = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: { roster: { include: { linkedPlayerProfile: { select: { userId: true } } } } },
    });
    const alreadyRegisteredUserIds = new Set(
      existing
        .map(r => r.roster?.linkedPlayerProfile?.userId)
        .filter((id): id is string => !!id),
    );

    const targetUserIds = members
      .map(m => m.roster?.linkedPlayerProfile?.userId)
      .filter((id): id is string => !!id && !alreadyRegisteredUserIds.has(id));

    if (!targetUserIds.length) {
      return { notified: 0, message: 'No eligible players to notify' };
    }

    await this.notifications.sendBulkWithData(
      targetUserIds,
      `¡Inscripciones abiertas: ${tournament.name}!`,
      customMessage?.trim() ||
        `Las inscripciones para ${tournament.name} están abiertas. Toca para inscribirte ahora.`,
      { type: 'TOURNAMENT_OPEN', tournamentId: tournament.id },
      'GENERAL',
    );

    return { notified: targetUserIds.length };
  }

  async getBracket(tournamentId: string, actor: ActingUser) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: {
            roster: {
              include: {
                linkedPlayerProfile: { select: { userId: true, displayName: true } },
              },
            },
            team: {
              include: {
                player1Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
                player2Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
              },
            },
          },
          orderBy: { registeredAt: 'asc' },
        },
        matches: {
          include: {
            playerOneRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
            playerTwoRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
            winnerRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
            teamOne: {
              include: {
                player1Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
                player2Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
              },
            },
            teamTwo: {
              include: {
                player1Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
                player2Roster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
              },
            },
          },
          orderBy: [{ bracketStage: 'asc' }, { round: 'asc' }, { scheduledTime: 'asc' }],
        },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    await this.assertTournamentAccess(tournament, actor);

    // Stamp memberships for client-side player classification (SOCIO/CASUAL/EXTERNO).
    await this.stampClubMemberships(tournament);

    const participants = tournament.registrations.map(registration => {
      if (registration.team) {
        const team = registration.team;
        return {
          type: 'TEAM',
          rosterId: null,
          teamId: team.id,
          memberRosterIds: [team.player1RosterId, team.player2RosterId],
          memberRosters: [team.player1Roster, team.player2Roster],
          name: this.teamName(team),
        };
      }
      return {
        type: 'PLAYER',
        rosterId: registration.rosterId,
        teamId: null,
        memberRosterIds: registration.rosterId ? [registration.rosterId] : [],
        roster: registration.roster,
        name: this.rosterName(registration.roster),
      };
    });

    if (!tournament.matches.length) {
      return {
        tournamentId: tournament.id,
        format: tournament.format,
        rounds: [],
        registrationOnly: true,
        participants,
      };
    }

    const grouped = new Map<string, {
      round: string;
      label: string;
      bracketStage: string;
      sortKey: number;
      matches: any[];
    }>();

    for (const match of tournament.matches) {
      const round = (match.round ?? 'R1').toUpperCase();
      const key = `${match.bracketStage}:${round}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          round,
          label: this.roundLabel(round),
          bracketStage: match.bracketStage,
          sortKey: this.bracketRoundSort(match.bracketStage, round),
          matches: [],
        });
      }

      const playerOne = match.teamOne
        ? {
            name: this.teamName(match.teamOne),
            type: 'TEAM',
            rosterId: null,
            teamId: match.teamOne.id,
            memberRosterIds: [match.teamOne.player1RosterId, match.teamOne.player2RosterId],
            memberRosters: [match.teamOne.player1Roster, match.teamOne.player2Roster],
          }
        : {
            name: this.rosterName(match.playerOneRoster),
            type: 'PLAYER',
            rosterId: match.playerOneRosterId,
            teamId: null,
            memberRosterIds: match.playerOneRosterId ? [match.playerOneRosterId] : [],
            roster: match.playerOneRoster,
          };

      const playerTwo = match.teamTwo
        ? {
            name: this.teamName(match.teamTwo),
            type: 'TEAM',
            rosterId: null,
            teamId: match.teamTwo.id,
            memberRosterIds: [match.teamTwo.player1RosterId, match.teamTwo.player2RosterId],
            memberRosters: [match.teamTwo.player1Roster, match.teamTwo.player2Roster],
          }
        : {
            name: this.rosterName(match.playerTwoRoster),
            type: 'PLAYER',
            rosterId: match.playerTwoRosterId,
            teamId: null,
            memberRosterIds: match.playerTwoRosterId ? [match.playerTwoRosterId] : [],
            roster: match.playerTwoRoster,
          };

      grouped.get(key)!.matches.push({
        id: match.id,
        playerOne,
        playerTwo,
        winnerRosterId: match.winnerRosterId,
        winnerTeamId: match.teamWinnerId,
        winnerSide: match.winnerRosterId
          ? match.winnerRosterId === match.playerOneRosterId ? 'ONE' : match.winnerRosterId === match.playerTwoRosterId ? 'TWO' : null
          : match.teamWinnerId
            ? match.teamWinnerId === match.teamOneId ? 'ONE' : match.teamWinnerId === match.teamTwoId ? 'TWO' : null
            : null,
        setScores: match.setScores,
        status: this.mobileMatchStatus(match.status),
        scheduledTime: match.scheduledTime,
      });
    }

    const rounds = Array.from(grouped.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...round }) => round);

    return {
      tournamentId: tournament.id,
      format: tournament.format,
      rounds,
      registrationOnly: false,
      participants,
    };
  }

  async getLigaPromocion(clubId: string, actor: ActingUser) {
    const playerRoster = await this.resolvePlayerRosterOrScopedStaff(clubId, actor);
    const season = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });

    if (!season) return { active: false };

    await this.ensureRankingRule(clubId, 'LIG', 'Liga Promoción', 30, 0);

    const tournament = await this.prisma.tournament.findFirst({
      where: {
        clubId,
        format: 'ROUND_ROBIN',
        status: { in: ['IN_PROGRESS', 'REGISTRATION_OPEN'] },
        endDate: { gte: season.startedAt },
      },
      include: {
        matches: {
          include: {
            court: true,
            playerOneRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
            playerTwoRoster: { include: { linkedPlayerProfile: { select: { displayName: true } } } },
          },
          orderBy: [{ scheduledTime: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { startDate: 'asc' },
    });

    if (!tournament) return { active: false };

    const rule = await this.prisma.clubRankingRule.findUnique({
      where: { clubId_categoryKey: { clubId, categoryKey: 'LIG' } },
    });
    const winnerPoints = rule?.winnerPoints ?? 0;
    const loserPoints = rule?.loserPoints ?? 0;

    const totals = new Map<string, {
      rosterId: string;
      name: string;
      played: number;
      wins: number;
      losses: number;
      points: number;
    }>();

    const touch = (rosterId: string | null, name: string) => {
      if (!rosterId) return null;
      if (!totals.has(rosterId)) {
        totals.set(rosterId, { rosterId, name, played: 0, wins: 0, losses: 0, points: 0 });
      }
      return totals.get(rosterId)!;
    };

    const fixtures = tournament.matches.map(match => {
      const playerOneName = this.rosterName(match.playerOneRoster);
      const playerTwoName = this.rosterName(match.playerTwoRoster);
      const completed = !!match.winnerRosterId || match.status === 'COMPLETED' || match.status === 'WALKOVER';

      const playerOne = touch(match.playerOneRosterId, playerOneName);
      const playerTwo = touch(match.playerTwoRosterId, playerTwoName);

      if (completed) {
        if (playerOne) playerOne.played += 1;
        if (playerTwo) playerTwo.played += 1;
        if (match.winnerRosterId && playerOne && playerTwo) {
          if (match.winnerRosterId === match.playerOneRosterId) {
            playerOne.wins += 1;
            playerTwo.losses += 1;
            playerOne.points += winnerPoints;
            playerTwo.points += loserPoints;
          } else if (match.winnerRosterId === match.playerTwoRosterId) {
            playerTwo.wins += 1;
            playerOne.losses += 1;
            playerTwo.points += winnerPoints;
            playerOne.points += loserPoints;
          }
        }
      }

      return {
        id: match.id,
        playerOneName,
        playerTwoName,
        playerOneRosterId: match.playerOneRosterId,
        playerTwoRosterId: match.playerTwoRosterId,
        scheduledTime: match.scheduledTime,
        court: match.court?.name ?? null,
        status: completed ? 'COMPLETED' : 'PENDING',
        round: match.round ?? null,
        setScores: match.setScores,
        winnerRosterId: match.winnerRosterId,
      };
    });

    const standings = Array.from(totals.values())
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'es'))
      .map((entry, index, arr) => {
        const promotionCutoff = Math.min(PROMOTE_COUNT, arr.length);
        const relegationStart = Math.max(arr.length - RELEGATE_COUNT, promotionCutoff);
        const zone = index < promotionCutoff
          ? 'PROMOTION'
          : index >= relegationStart
            ? 'RELEGATION'
            : null;

        return {
          position: index + 1,
          rosterId: entry.rosterId,
          name: entry.name,
          played: entry.played,
          wins: entry.wins,
          losses: entry.losses,
          points: entry.points,
          zone,
        };
      });

    const nextMatch = playerRoster
      ? fixtures.find(match =>
          match.status === 'PENDING' &&
          (match.playerOneRosterId === playerRoster.id || match.playerTwoRosterId === playerRoster.id),
        )
      : null;

    const nextMatchPayload = nextMatch
      ? {
          opponentName: nextMatch.playerOneRosterId === playerRoster?.id ? nextMatch.playerTwoName : nextMatch.playerOneName,
          scheduledTime: nextMatch.scheduledTime,
          court: nextMatch.court,
        }
      : null;

    return {
      active: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        currentRound: nextMatch?.round ?? tournament.matches.find(match => match.status === 'SCHEDULED')?.round ?? tournament.matches.at(-1)?.round ?? null,
      },
      standings,
      nextMatch: nextMatchPayload,
      fixtures,
    };
  }

  private async ensureExists(id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  private async assertTournamentAccess(
    tournament: any,
    actor: ActingUser,
  ) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.staffClubId === tournament.clubId || actor.role === 'CLUB_ADMIN') {
      try {
        await assertClubScope(actor, tournament.clubId, this.prisma);
        return;
      } catch {
        // Fall through to player-level tournament access.
      }
    }

    const hasRegistration = tournament.registrations.some(registration =>
      registration.roster?.linkedPlayerProfile?.userId === actor.id ||
      registration.team?.player1Roster?.linkedPlayerProfile?.userId === actor.id ||
      registration.team?.player2Roster?.linkedPlayerProfile?.userId === actor.id,
    );

    if (!hasRegistration) {
      throw new ForbiddenException('You do not have access to this tournament bracket');
    }
  }

  private roundLabel(round: string) {
    switch (round) {
      case 'QF': return 'Cuartos de Final';
      case 'SF': return 'Semifinales';
      case 'F':
      case 'FINAL': return 'Final';
      default: return round;
    }
  }

  private bracketRoundSort(stage: string, round: string) {
    const stageOrder = new Map([['MAIN', 0], ['WINNERS', 100], ['LOSERS', 200]]);
    const roundOrder = new Map([
      ['R1', 1],
      ['R2', 2],
      ['R3', 3],
      ['QF', 10],
      ['SF', 20],
      ['F', 30],
      ['FINAL', 30],
    ]);
    return (stageOrder.get(stage) ?? 999) + (roundOrder.get(round) ?? 90);
  }

  private rosterName(
    roster?: {
      firstName?: string | null;
      lastName?: string | null;
      linkedPlayerProfile?: { displayName?: string | null } | null;
    } | null,
  ) {
    if (!roster) return 'TBD';
    return (
      (roster.linkedPlayerProfile?.displayName ??
      `${roster.firstName ?? ''} ${roster.lastName ?? ''}`.trim()) ||
      'TBD'
    );
  }

  private teamName(team: {
    player1Roster: { firstName?: string | null; lastName?: string | null; linkedPlayerProfile?: { displayName?: string | null } | null };
    player2Roster: { firstName?: string | null; lastName?: string | null; linkedPlayerProfile?: { displayName?: string | null } | null };
  }) {
    return `${this.rosterName(team.player1Roster)} / ${this.rosterName(team.player2Roster)}`;
  }

  private mobileMatchStatus(status: string) {
    return status === 'COMPLETED' || status === 'WALKOVER' ? 'COMPLETED' : 'PENDING';
  }

  private async resolvePlayerRosterOrScopedStaff(clubId: string, actor: ActingUser) {
    const roster = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, linkedPlayerProfile: { userId: actor.id } },
    });
    if (roster) return roster;

    await assertClubScope(actor, clubId, this.prisma);
    return null;
  }

  private async ensureRankingRule(
    clubId: string,
    categoryKey: string,
    label: string,
    winnerPoints: number,
    loserPoints: number,
  ) {
    await this.prisma.clubRankingRule.upsert({
      where: { clubId_categoryKey: { clubId, categoryKey } },
      create: { clubId, categoryKey, label, winnerPoints, loserPoints, active: true },
      update: {},
    });
  }
}
