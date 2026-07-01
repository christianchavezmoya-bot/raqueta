import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChallengeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { ClubRankingsService } from '../club-rankings/club-rankings.service';

type ChallengeSetScore = { winner: number; loser: number };

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly clubRankingsService: ClubRankingsService,
  ) {}

  async list(clubId: string, actor: ActingUser) {
    const roster = await this.requireLinkedRoster(clubId, actor.id);
    const season = await this.getActiveSeason(clubId);
    const pointsAtStake = await this.ensureChallengeRule(clubId);

    await this.expireStaleChallenges(clubId, season.id, roster.id);

    const myEntry = await this.requireSeasonEntry(clubId, season.id, roster.id);
    const openChallenges = await this.prisma.challenge.findMany({
      where: {
        clubId,
        seasonId: season.id,
        status: { in: [ChallengeStatus.PENDING, ChallengeStatus.ACCEPTED] },
        OR: [{ challengerRosterId: roster.id }, { challengedRosterId: roster.id }],
      },
    });

    const blockedOpponents = new Set(
      openChallenges.map(challenge =>
        challenge.challengerRosterId === roster.id
          ? challenge.challengedRosterId
          : challenge.challengerRosterId,
      ),
    );

    const entries = await this.prisma.clubRankingEntry.findMany({
      where: {
        clubId,
        seasonId: season.id,
        division: myEntry.division ?? undefined,
        withdrawn: false,
      },
      include: {
        rosterEntry: {
          include: {
            linkedPlayerProfile: { select: { displayName: true } },
          },
        },
      },
      orderBy: { rank: 'asc' },
    });

    const available = entries
      .filter(entry =>
        entry.rosterId !== roster.id &&
        entry.rank < myEntry.rank &&
        myEntry.rank - entry.rank <= 10 &&
        !blockedOpponents.has(entry.rosterId),
      )
      .map(entry => ({
        rosterId: entry.rosterId,
        name: this.rosterName(entry.rosterEntry),
        rank: entry.rank,
        division: entry.division,
      }));

    const [pending, incoming, recent] = await Promise.all([
      this.prisma.challenge.findMany({
        where: {
          clubId,
          seasonId: season.id,
          challengerRosterId: roster.id,
          status: ChallengeStatus.PENDING,
        },
        include: this.challengeInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.challenge.findMany({
        where: {
          clubId,
          seasonId: season.id,
          challengedRosterId: roster.id,
          status: ChallengeStatus.PENDING,
        },
        include: this.challengeInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.challenge.findMany({
        where: {
          clubId,
          seasonId: season.id,
          status: { in: [ChallengeStatus.COMPLETED, ChallengeStatus.REJECTED, ChallengeStatus.EXPIRED, ChallengeStatus.CANCELLED] },
          OR: [{ challengerRosterId: roster.id }, { challengedRosterId: roster.id }],
        },
        include: this.challengeInclude(),
        orderBy: [{ respondedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
    ]);

    return {
      pointsAtStake,
      available,
      pending: pending.map(challenge => this.mapPendingChallenge(challenge)),
      incoming: incoming.map(challenge => this.mapIncomingChallenge(challenge)),
      recent: recent.map(challenge => this.mapRecentChallenge(challenge, roster.id)),
    };
  }

  async create(clubId: string, challengedRosterId: string, actor: ActingUser) {
    const challenger = await this.requireLinkedRoster(clubId, actor.id);
    const season = await this.getActiveSeason(clubId);
    const pointsAtStake = await this.ensureChallengeRule(clubId);

    await this.expireStaleChallenges(clubId, season.id, challenger.id);

    if (challenger.id === challengedRosterId) {
      throw new BadRequestException('No puedes desafiarte a ti mismo');
    }

    const [challengerEntry, challengedEntry, challengedRoster] = await Promise.all([
      this.requireSeasonEntry(clubId, season.id, challenger.id),
      this.requireSeasonEntry(clubId, season.id, challengedRosterId),
      this.requireRosterById(clubId, challengedRosterId),
    ]);

    if (!challengerEntry.division || challengerEntry.division !== challengedEntry.division) {
      throw new BadRequestException('Solo puedes desafiar jugadores de tu misma división');
    }
    if (challengedEntry.rank >= challengerEntry.rank) {
      throw new BadRequestException('Solo puedes desafiar jugadores ubicados por encima de ti');
    }
    if (challengerEntry.rank - challengedEntry.rank > 10) {
      throw new BadRequestException('Solo puedes desafiar jugadores ubicados hasta 10 posiciones arriba');
    }

    await this.assertNoOpenChallenge(season.id, challenger.id, challengedRosterId);

    const created = await this.prisma.challenge.create({
      data: {
        clubId,
        seasonId: season.id,
        challengerRosterId: challenger.id,
        challengedRosterId,
        pointsAtStake,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      include: this.challengeInclude(),
    });

    const challengedUserId = challengedRoster.linkedPlayerProfile?.userId;
    if (challengedUserId) {
      void this.notifications.send(
        challengedUserId,
        'Nuevo desafío recibido',
        `${this.rosterName(challenger)} te desafió por ${pointsAtStake} puntos`,
        'GENERAL',
      );
    }

    return this.mapIncomingChallenge(created);
  }

  async accept(clubId: string, challengeId: string, actor: ActingUser) {
    const roster = await this.requireLinkedRoster(clubId, actor.id);
    const challenge = await this.requireChallenge(clubId, challengeId);
    await this.expireIfNeeded(challenge);

    if (challenge.challengedRosterId !== roster.id) {
      throw new ForbiddenException('Solo el jugador desafiado puede aceptar este desafío');
    }
    if (challenge.status !== ChallengeStatus.PENDING) {
      throw new BadRequestException(`El desafío ya está ${challenge.status.toLowerCase()}`);
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.ACCEPTED, respondedAt: new Date() },
      include: this.challengeInclude(),
    });

    const challengerUserId = updated.challenger.linkedPlayerProfile?.userId;
    if (challengerUserId) {
      void this.notifications.send(
        challengerUserId,
        'Desafío aceptado',
        `${this.rosterName(updated.challenged)} aceptó tu desafío`,
        'GENERAL',
      );
    }

    return this.mapPendingChallenge(updated);
  }

  async reject(clubId: string, challengeId: string, actor: ActingUser) {
    const roster = await this.requireLinkedRoster(clubId, actor.id);
    const challenge = await this.requireChallenge(clubId, challengeId);
    await this.expireIfNeeded(challenge);

    if (challenge.challengedRosterId !== roster.id) {
      throw new ForbiddenException('Solo el jugador desafiado puede rechazar este desafío');
    }
    if (challenge.status !== ChallengeStatus.PENDING) {
      throw new BadRequestException(`El desafío ya está ${challenge.status.toLowerCase()}`);
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { status: ChallengeStatus.REJECTED, respondedAt: new Date() },
      include: this.challengeInclude(),
    });

    const challengerUserId = updated.challenger.linkedPlayerProfile?.userId;
    if (challengerUserId) {
      void this.notifications.send(
        challengerUserId,
        'Desafío rechazado',
        `${this.rosterName(updated.challenged)} rechazó tu desafío`,
        'GENERAL',
      );
    }

    return this.mapRecentChallenge(updated, updated.challengerRosterId);
  }

  async submitResult(
    clubId: string,
    challengeId: string,
    body: { winnerRosterId: string; setScores?: ChallengeSetScore[] },
    actor: ActingUser,
  ) {
    const challenge = await this.requireChallenge(clubId, challengeId);
    await this.expireIfNeeded(challenge);

    if (actor.role === 'SUPER_ADMIN' || actor.role === 'CLUB_ADMIN' || actor.role === 'MANAGER' || actor.role === 'RECEPTION') {
      await assertClubScope(actor, clubId, this.prisma);
    } else {
      const roster = await this.requireLinkedRoster(clubId, actor.id);
      if (roster.id !== challenge.challengerRosterId) {
        throw new ForbiddenException('Solo el desafiante o el staff del club pueden registrar el resultado');
      }
    }

    if (challenge.status !== ChallengeStatus.ACCEPTED) {
      throw new BadRequestException('Solo puedes registrar el resultado de un desafío aceptado');
    }
    if (![challenge.challengerRosterId, challenge.challengedRosterId].includes(body.winnerRosterId)) {
      throw new BadRequestException('winnerRosterId debe pertenecer a uno de los jugadores del desafío');
    }

    const loserRosterId = body.winnerRosterId === challenge.challengerRosterId
      ? challenge.challengedRosterId
      : challenge.challengerRosterId;

    const result = await this.clubRankingsService.createMatchResultAuthorized(
      clubId,
      {
        seasonId: challenge.seasonId,
        winnerRosterId: body.winnerRosterId,
        loserRosterId,
        winnerNameRaw: this.rosterName(
          body.winnerRosterId === challenge.challengerRosterId ? challenge.challenger : challenge.challenged,
        ),
        loserNameRaw: this.rosterName(
          loserRosterId === challenge.challengerRosterId ? challenge.challenger : challenge.challenged,
        ),
        categoryKey: 'DESAFIO',
        setScores: body.setScores,
        recordedAt: new Date().toISOString(),
      },
      actor.id,
    );

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: ChallengeStatus.COMPLETED,
        respondedAt: new Date(),
        matchResultId: result.created.id,
      },
      include: this.challengeInclude(),
    });

    const recipientUserIds = [
      updated.challenger.linkedPlayerProfile?.userId,
      updated.challenged.linkedPlayerProfile?.userId,
    ].filter((id): id is string => !!id);

    if (recipientUserIds.length) {
      void this.notifications.sendBulk(
        recipientUserIds,
        'Resultado de desafío registrado',
        `${this.rosterName(body.winnerRosterId === updated.challengerRosterId ? updated.challenger : updated.challenged)} ganó el desafío`,
        'RESULT_ENTERED',
      );
    }

    return {
      challenge: this.mapRecentChallenge(updated, updated.challengerRosterId),
      result,
    };
  }

  private async requireLinkedRoster(clubId: string, userId: string) {
    const roster = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, linkedPlayerProfile: { userId } },
      include: {
        linkedPlayerProfile: { select: { userId: true, displayName: true } },
      },
    });
    if (!roster) {
      throw new ForbiddenException('No tienes una conexión de roster válida con este club');
    }
    return roster;
  }

  private async requireRosterById(clubId: string, rosterId: string) {
    const roster = await this.prisma.clubPlayerRoster.findFirst({
      where: { id: rosterId, clubId },
      include: {
        linkedPlayerProfile: { select: { userId: true, displayName: true } },
      },
    });
    if (!roster) throw new NotFoundException('Jugador no encontrado en este club');
    return roster;
  }

  private async requireSeasonEntry(clubId: string, seasonId: string, rosterId: string) {
    const entry = await this.prisma.clubRankingEntry.findFirst({
      where: { clubId, seasonId, rosterId },
      include: {
        rosterEntry: {
          include: {
            linkedPlayerProfile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!entry) throw new BadRequestException('El jugador no tiene ranking activo en esta temporada');
    return entry;
  }

  private async getActiveSeason(clubId: string) {
    const season = await this.prisma.rankingSeason.findFirst({
      where: { clubId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
    if (!season) throw new BadRequestException('No hay una temporada activa en este club');
    return season;
  }

  private async ensureChallengeRule(clubId: string) {
    const rule = await this.prisma.clubRankingRule.upsert({
      where: { clubId_categoryKey: { clubId, categoryKey: 'DESAFIO' } },
      create: {
        clubId,
        categoryKey: 'DESAFIO',
        label: 'Desafío',
        winnerPoints: 25,
        loserPoints: 0,
        active: true,
      },
      update: {},
    });
    return rule.winnerPoints;
  }

  private async assertNoOpenChallenge(seasonId: string, challengerRosterId: string, challengedRosterId: string) {
    const existing = await this.prisma.challenge.findFirst({
      where: {
        seasonId,
        status: { in: [ChallengeStatus.PENDING, ChallengeStatus.ACCEPTED] },
        OR: [
          { challengerRosterId, challengedRosterId },
          { challengerRosterId: challengedRosterId, challengedRosterId: challengerRosterId },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Ya existe un desafío activo entre estos jugadores');
    }
  }

  private async requireChallenge(clubId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id: challengeId, clubId },
      include: this.challengeInclude(),
    });
    if (!challenge) throw new NotFoundException('Desafío no encontrado');
    return challenge;
  }

  private async expireStaleChallenges(clubId: string, seasonId: string, rosterId: string) {
    await this.prisma.challenge.updateMany({
      where: {
        clubId,
        seasonId,
        status: ChallengeStatus.PENDING,
        expiresAt: { lt: new Date() },
        OR: [{ challengerRosterId: rosterId }, { challengedRosterId: rosterId }],
      },
      data: {
        status: ChallengeStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });
  }

  private async expireIfNeeded(challenge: { id: string; status: ChallengeStatus; expiresAt: Date }) {
    if (challenge.status === ChallengeStatus.PENDING && challenge.expiresAt < new Date()) {
      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: ChallengeStatus.EXPIRED, respondedAt: new Date() },
      });
      throw new BadRequestException('El desafío ya expiró');
    }
  }

  private rosterName(roster?: {
    firstName?: string | null;
    lastName?: string | null;
    linkedPlayerProfile?: { displayName?: string | null; userId?: string | null } | null;
  } | null) {
    if (!roster) return 'Jugador';
    return (
      (roster.linkedPlayerProfile?.displayName ??
      `${roster.firstName ?? ''} ${roster.lastName ?? ''}`.trim()) ||
      'Jugador'
    );
  }

  private mapPendingChallenge(challenge: Awaited<ReturnType<ChallengesService['requireChallenge']>>) {
    return {
      id: challenge.id,
      status: challenge.status,
      pointsAtStake: challenge.pointsAtStake,
      expiresAt: challenge.expiresAt,
      challengerName: this.rosterName(challenge.challenger),
      challengedName: this.rosterName(challenge.challenged),
      challengerRosterId: challenge.challengerRosterId,
      challengedRosterId: challenge.challengedRosterId,
    };
  }

  private mapIncomingChallenge(challenge: Awaited<ReturnType<ChallengesService['requireChallenge']>>) {
    return this.mapPendingChallenge(challenge);
  }

  private mapRecentChallenge(challenge: Awaited<ReturnType<ChallengesService['requireChallenge']>>, viewerRosterId: string) {
    const isChallenger = challenge.challengerRosterId === viewerRosterId;
    const opponent = isChallenger ? challenge.challenged : challenge.challenger;
    const completed = challenge.status === ChallengeStatus.COMPLETED;
    const viewerWon = completed ? challenge.matchResult?.winnerRosterId === viewerRosterId : null;

    return {
      id: challenge.id,
      status: challenge.status,
      opponentName: this.rosterName(opponent),
      playedAt: challenge.matchResult?.recordedAt ?? challenge.respondedAt ?? challenge.createdAt,
      expiresAt: challenge.expiresAt,
      matchResultId: challenge.matchResultId,
      result: completed ? (viewerWon ? 'WIN' : 'LOSS') : null,
      pointsDelta: completed
        ? viewerWon
          ? challenge.pointsAtStake
          : 0
        : null,
    };
  }

  private challengeInclude() {
    return {
      challenger: {
        include: {
          linkedPlayerProfile: { select: { userId: true, displayName: true } },
        },
      },
      challenged: {
        include: {
          linkedPlayerProfile: { select: { userId: true, displayName: true } },
        },
      },
      matchResult: {
        select: {
          id: true,
          winnerRosterId: true,
          loserRosterId: true,
          recordedAt: true,
        },
      },
    } as const;
  }
}
