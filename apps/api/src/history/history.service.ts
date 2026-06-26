import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

type MatchCompetitionType = 'LADDER' | 'TOURNAMENT' | 'PERSONAL_LOG';

type MatchHistoryFilters = {
  from?: Date;
  to?: Date;
  competitionTypes?: MatchCompetitionType[];
  division?: string;
  category?: string;
};

type ReservationOutcome =
  | 'PENDING'
  | 'PLAYED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'UNPAID';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async getCourtHistory(
    clubId: string,
    filters: { from?: Date; to?: Date; courtId?: string },
    actor: ActingUser,
  ) {
    await this.assertScope(clubId, actor);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        clubId,
        ...(filters.courtId ? { courtId: filters.courtId } : {}),
        ...(filters.from || filters.to
          ? {
              startTime: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        court: { select: { id: true, name: true, surfaceType: true } },
        user: {
          select: {
            id: true,
            email: true,
            playerProfile: { select: { id: true, displayName: true } },
          },
        },
        createdByUser: {
          select: {
            id: true,
            email: true,
            playerProfile: { select: { displayName: true } },
          },
        },
      },
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      filters: {
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
        courtId: filters.courtId ?? null,
      },
      count: reservations.length,
      items: reservations.map(reservation => ({
        id: reservation.id,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        status: reservation.status,
        paymentStatus: reservation.paymentStatus,
        outcome: this.mapReservationOutcome(reservation.status, reservation.paymentStatus),
        price: reservation.price,
        currency: reservation.currency,
        notes: reservation.notes,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
        court: reservation.court,
        player: {
          userId: reservation.user.id,
          playerProfileId: reservation.user.playerProfile?.id ?? null,
          displayName: reservation.user.playerProfile?.displayName ?? reservation.user.email,
          email: reservation.user.email,
        },
        createdBy: {
          userId: reservation.createdByUser.id,
          displayName: reservation.createdByUser.playerProfile?.displayName ?? reservation.createdByUser.email,
          email: reservation.createdByUser.email,
        },
      })),
    };
  }

  async getMatchHistory(clubId: string, filters: MatchHistoryFilters, actor: ActingUser) {
    await this.assertScope(clubId, actor);

    const { linkedProfiles, rosterDivisionByProfileId } = await this.getLinkedProfiles(clubId);
    const requestedTypes = new Set(
      filters.competitionTypes?.length
        ? filters.competitionTypes
        : (['LADDER', 'TOURNAMENT', 'PERSONAL_LOG'] as MatchCompetitionType[]),
    );

    const [ladderMatches, tournamentMatches, personalLogs] = await Promise.all([
      requestedTypes.has('LADDER')
        ? this.prisma.clubMatchResult.findMany({
            where: { clubId },
            include: {
              season: { select: { id: true, label: true, status: true } },
              winnerRoster: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  division: true,
                  linkedPlayerProfile: { select: { id: true, displayName: true } },
                },
              },
              loserRoster: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  division: true,
                  linkedPlayerProfile: { select: { id: true, displayName: true } },
                },
              },
              enteredByUser: { select: { id: true, email: true } },
            },
            orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
      requestedTypes.has('TOURNAMENT')
        ? this.prisma.match.findMany({
            where: {
              tournament: { clubId },
              status: { in: [MatchStatus.COMPLETED, MatchStatus.WALKOVER] },
            },
            include: {
              tournament: { select: { id: true, name: true } },
              category: { select: { id: true, name: true } },
              court: { select: { id: true, name: true } },
              playerOne: {
                select: {
                  id: true,
                  email: true,
                  playerProfile: { select: { id: true, displayName: true, homeClubId: true } },
                },
              },
              playerTwo: {
                select: {
                  id: true,
                  email: true,
                  playerProfile: { select: { id: true, displayName: true, homeClubId: true } },
                },
              },
              winner: {
                select: {
                  id: true,
                  email: true,
                  playerProfile: { select: { id: true, displayName: true } },
                },
              },
            },
            orderBy: [{ updatedAt: 'desc' }],
          })
        : Promise.resolve([]),
      requestedTypes.has('PERSONAL_LOG') && linkedProfiles.length
        ? this.prisma.matchLogEntry.findMany({
            where: {
              type: 'MATCH',
              playerId: { in: linkedProfiles.map(profile => profile.id) },
            },
            include: {
              player: {
                select: {
                  id: true,
                  displayName: true,
                  user: { select: { id: true, email: true } },
                },
              },
              opponent: {
                select: {
                  id: true,
                  displayName: true,
                  user: { select: { id: true, email: true } },
                },
              },
            },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
    ]);

    const items = [
      ...ladderMatches.map(match => {
        const division = match.winnerRoster?.division ?? match.loserRoster?.division ?? null;
        return {
          id: match.id,
          competitionType: 'LADDER' as const,
          playedAt: match.recordedAt,
          sortAt: match.recordedAt,
          category: match.categoryKey,
          division,
          season: match.season,
          summary: `${this.displayRosterName(match.winnerNameRaw, match.winnerRoster)} venció a ${this.displayRosterName(match.loserNameRaw, match.loserRoster)}`,
          winner: {
            rosterId: match.winnerRosterId,
            name: this.displayRosterName(match.winnerNameRaw, match.winnerRoster),
            division: match.winnerRoster?.division ?? null,
            playerProfileId: match.winnerRoster?.linkedPlayerProfile?.id ?? null,
          },
          loser: {
            rosterId: match.loserRosterId,
            name: this.displayRosterName(match.loserNameRaw, match.loserRoster),
            division: match.loserRoster?.division ?? null,
            playerProfileId: match.loserRoster?.linkedPlayerProfile?.id ?? null,
          },
          score: match.setScores,
          source: match.source,
          enteredBy: match.enteredByUser,
        };
      }),
      ...tournamentMatches.map(match => {
        const playedAt = match.scheduledTime ?? match.updatedAt;
        return {
          id: match.id,
          competitionType: 'TOURNAMENT' as const,
          playedAt,
          sortAt: playedAt,
          category: match.category?.name ?? null,
          division: null,
          season: null,
          summary: `${this.displayUserName(match.playerOne)} vs ${this.displayUserName(match.playerTwo)}`,
          winner: match.winner
            ? {
                userId: match.winner.id,
                playerProfileId: match.winner.playerProfile?.id ?? null,
                name: this.displayUserName(match.winner),
              }
            : null,
          loser: null,
          score: {
            playerOne: match.playerOneScore,
            playerTwo: match.playerTwoScore,
          },
          status: match.status,
          round: match.round,
          tournament: match.tournament,
          court: match.court,
        };
      }),
      ...personalLogs.map(log => ({
        id: log.id,
        competitionType: 'PERSONAL_LOG' as const,
        playedAt: log.date,
        sortAt: log.date,
        category: null,
        division: rosterDivisionByProfileId.get(log.playerId) ?? null,
        season: null,
        summary: `${log.player.displayName} registró un partido personal`,
        winner: log.playerWon === true
          ? {
              userId: log.player.user.id,
              playerProfileId: log.player.id,
              name: log.player.displayName,
            }
          : log.playerWon === false && log.opponent
            ? {
                userId: log.opponent.user?.id ?? null,
                playerProfileId: log.opponent.id,
                name: log.opponent.displayName,
              }
            : null,
        loser: log.playerWon === false
          ? {
              userId: log.player.user.id,
              playerProfileId: log.player.id,
              name: log.player.displayName,
            }
          : log.playerWon === true && log.opponent
            ? {
                userId: log.opponent.user?.id ?? null,
                playerProfileId: log.opponent.id,
                name: log.opponent.displayName,
              }
            : null,
        score: log.setsData,
        logOwner: {
          userId: log.player.user.id,
          playerProfileId: log.player.id,
          displayName: log.player.displayName,
        },
        opponent: log.opponent
          ? {
              userId: log.opponent.user?.id ?? null,
              playerProfileId: log.opponent.id,
              displayName: log.opponent.displayName,
            }
          : {
              userId: null,
              playerProfileId: null,
              displayName: log.opponentName ?? 'Rival externo',
            },
        playerWon: log.playerWon,
        notes: log.notes,
      })),
    ]
      .filter(item => this.matchesFilters(item, filters))
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

    return {
      filters: {
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
        competitionTypes: Array.from(requestedTypes),
        division: filters.division ?? null,
        category: filters.category ?? null,
      },
      countsByType: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.competitionType] = (acc[item.competitionType] ?? 0) + 1;
        return acc;
      }, {}),
      count: items.length,
      items,
    };
  }

  async getPlayerHistory(clubId: string, rosterId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);

    const roster = await this.prisma.clubPlayerRoster.findFirst({
      where: { id: rosterId, clubId },
      include: {
        linkedPlayerProfile: {
          include: {
            user: { select: { id: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!roster) throw new NotFoundException('Roster entry not found');

    const linkedProfileId = roster.linkedPlayerProfile?.id ?? null;
    const linkedUserId = roster.linkedPlayerProfile?.userId ?? null;

    const [ladderMatches, tournamentMatches, reservations, rankingHistory, bonusAwards, personalLogs] =
      await Promise.all([
        this.prisma.clubMatchResult.findMany({
          where: {
            clubId,
            OR: [{ winnerRosterId: rosterId }, { loserRosterId: rosterId }],
          },
          include: {
            season: { select: { id: true, label: true, status: true, startedAt: true, closedAt: true } },
            winnerRoster: { select: { id: true, firstName: true, lastName: true, division: true } },
            loserRoster: { select: { id: true, firstName: true, lastName: true, division: true } },
          },
          orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
        }),
        linkedUserId
          ? this.prisma.match.findMany({
              where: {
                tournament: { clubId },
                status: { in: [MatchStatus.COMPLETED, MatchStatus.WALKOVER] },
                OR: [{ playerOneId: linkedUserId }, { playerTwoId: linkedUserId }],
              },
              include: {
                tournament: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
                court: { select: { id: true, name: true } },
                playerOne: { select: { id: true, email: true, playerProfile: { select: { id: true, displayName: true } } } },
                playerTwo: { select: { id: true, email: true, playerProfile: { select: { id: true, displayName: true } } } },
                winner: { select: { id: true, email: true, playerProfile: { select: { id: true, displayName: true } } } },
              },
              orderBy: [{ updatedAt: 'desc' }],
            })
          : Promise.resolve([]),
        linkedUserId
          ? this.prisma.reservation.findMany({
              where: { clubId, userId: linkedUserId },
              include: {
                court: { select: { id: true, name: true, surfaceType: true } },
              },
              orderBy: [{ startTime: 'desc' }],
            })
          : Promise.resolve([]),
        this.prisma.clubRankingEntry.findMany({
          where: { clubId, rosterId },
          include: {
            season: { select: { id: true, label: true, status: true, startedAt: true, closedAt: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
        this.prisma.clubBonusPointAward.findMany({
          where: { clubId, rosterId },
          include: {
            season: { select: { id: true, label: true, status: true, startedAt: true, closedAt: true } },
            bonusType: { select: { id: true, key: true, label: true, points: true } },
            awardedByUser: { select: { id: true, email: true } },
          },
          orderBy: [{ awardedAt: 'desc' }],
        }),
        linkedProfileId
          ? this.prisma.matchLogEntry.findMany({
              where: { type: 'MATCH', playerId: linkedProfileId },
              include: {
                opponent: { select: { id: true, displayName: true, user: { select: { id: true, email: true } } } },
              },
              orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            })
          : Promise.resolve([]),
      ]);

    const withdrawals = rankingHistory
      .filter(entry => entry.withdrawn)
      .map(entry => ({
        season: entry.season,
        withdrawn: entry.withdrawn,
        updatedAt: entry.updatedAt,
      }));

    const timeline = [
      ...ladderMatches.map(match => ({
        kind: 'LADDER_MATCH' as const,
        occurredAt: match.recordedAt,
        summary: match.winnerRosterId === rosterId
          ? `Victoria sobre ${this.displayRosterName(match.loserNameRaw, match.loserRoster)}`
          : `Derrota ante ${this.displayRosterName(match.winnerNameRaw, match.winnerRoster)}`,
        details: {
          id: match.id,
          season: match.season,
          category: match.categoryKey,
          source: match.source,
          score: match.setScores,
        },
      })),
      ...tournamentMatches.map(match => ({
        kind: 'TOURNAMENT_MATCH' as const,
        occurredAt: match.scheduledTime ?? match.updatedAt,
        summary: `${match.tournament?.name ?? 'Torneo'}: ${this.displayUserName(match.playerOne)} vs ${this.displayUserName(match.playerTwo)}`,
        details: {
          id: match.id,
          tournament: match.tournament,
          category: match.category,
          score: { playerOne: match.playerOneScore, playerTwo: match.playerTwoScore },
          winnerId: match.winnerId,
        },
      })),
      ...personalLogs.map(log => ({
        kind: 'PERSONAL_LOG' as const,
        occurredAt: log.date,
        summary: `Bitácora personal vs ${log.opponent?.displayName ?? log.opponentName ?? 'rival externo'}`,
        details: {
          id: log.id,
          playerWon: log.playerWon,
          bestOf: log.bestOf,
          score: log.setsData,
          notes: log.notes,
        },
      })),
      ...reservations.map(reservation => ({
        kind: 'RESERVATION' as const,
        occurredAt: reservation.startTime,
        summary: `Reserva en ${reservation.court.name}`,
        details: {
          id: reservation.id,
          status: reservation.status,
          paymentStatus: reservation.paymentStatus,
          outcome: this.mapReservationOutcome(reservation.status, reservation.paymentStatus),
          court: reservation.court,
        },
      })),
      ...bonusAwards.map(award => ({
        kind: 'BONUS_AWARD' as const,
        occurredAt: award.awardedAt,
        summary: `Bono ${award.bonusType.label} (+${award.bonusType.points})`,
        details: {
          id: award.id,
          season: award.season,
          note: award.note,
          awardedBy: award.awardedByUser.email,
        },
      })),
      ...withdrawals.map(withdrawal => ({
        kind: 'WITHDRAWAL' as const,
        occurredAt: withdrawal.updatedAt,
        summary: `Retiro registrado en ${withdrawal.season?.label ?? 'temporada sin etiqueta'}`,
        details: withdrawal,
      })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return {
      player: {
        rosterId: roster.id,
        clubId: roster.clubId,
        fullName: `${roster.firstName} ${roster.lastName}`,
        division: roster.division,
        linkedPlayerProfileId: linkedProfileId,
        linkedUserId,
        linkedDisplayName: roster.linkedPlayerProfile?.displayName ?? null,
        linkedEmail: roster.linkedPlayerProfile?.user.email ?? null,
      },
      counts: {
        ladderMatches: ladderMatches.length,
        tournamentMatches: tournamentMatches.length,
        personalLogs: personalLogs.length,
        reservations: reservations.length,
        rankingSnapshots: rankingHistory.length,
        bonusAwards: bonusAwards.length,
        withdrawals: withdrawals.length,
      },
      ladderMatches,
      tournamentMatches: tournamentMatches.map(match => ({
        ...match,
        playedAt: match.scheduledTime ?? match.updatedAt,
      })),
      personalLogs,
      reservations: reservations.map(reservation => ({
        ...reservation,
        outcome: this.mapReservationOutcome(reservation.status, reservation.paymentStatus),
      })),
      rankingHistory,
      bonusAwards,
      withdrawals,
      timeline,
    };
  }

  private matchesFilters(item: { sortAt: Date; competitionType: MatchCompetitionType; division: string | null; category: string | null }, filters: MatchHistoryFilters) {
    if (filters.from && item.sortAt < filters.from) return false;
    if (filters.to && item.sortAt > filters.to) return false;
    if (filters.competitionTypes?.length && !filters.competitionTypes.includes(item.competitionType)) return false;
    if (filters.division && item.division?.toLowerCase() !== filters.division.toLowerCase()) return false;
    if (filters.category && item.category?.toLowerCase() !== filters.category.toLowerCase()) return false;
    return true;
  }

  private mapReservationOutcome(status: string, paymentStatus: string): ReservationOutcome {
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'NO_SHOW') return 'NO_SHOW';
    if (status === 'COMPLETED') return 'PLAYED';
    if (status === 'PENDING_PAYMENT' && paymentStatus === 'PENDING') return 'UNPAID';
    return 'PENDING';
  }

  private displayRosterName(raw: string, roster?: { firstName: string; lastName: string } | null) {
    if (roster) return `${roster.firstName} ${roster.lastName}`;
    return raw;
  }

  private displayUserName(user?: {
    email: string;
    playerProfile?: { displayName: string | null } | null;
  } | null) {
    if (!user) return 'Jugador desconocido';
    return user.playerProfile?.displayName ?? user.email;
  }

  private async assertScope(clubId: string, actor: ActingUser) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club not found');
    await assertClubScope(actor, clubId, this.prisma);
  }

  private async getLinkedProfiles(clubId: string) {
    const rosterEntries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId, linkedPlayerProfileId: { not: null } },
      select: {
        id: true,
        division: true,
        linkedPlayerProfile: {
          select: { id: true },
        },
      },
    });

    const linkedProfiles = rosterEntries
      .map(entry => entry.linkedPlayerProfile)
      .filter((profile): profile is { id: string } => !!profile);
    const rosterDivisionByProfileId = new Map<string, string | null>();
    for (const entry of rosterEntries) {
      if (entry.linkedPlayerProfile?.id) {
        rosterDivisionByProfileId.set(entry.linkedPlayerProfile.id, entry.division ?? null);
      }
    }

    return { linkedProfiles, rosterDivisionByProfileId };
  }
}
