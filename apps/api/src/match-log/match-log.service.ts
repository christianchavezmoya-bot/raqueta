import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateTennisScore, SetResult } from './tennis-score.util';

export interface CreateMatchLogDto {
  type: 'MATCH' | 'TRAINING' | 'COACHING' | 'FITNESS';
  date: string; // ISO date string
  durationMins?: number;
  location?: string;
  notes?: string;
  opponentId?: string;   // registered player user-id (optional)
  opponentName?: string; // free-text name for unregistered opponent
  bestOf?: 3 | 5;
  sets?: SetResult[];
}

@Injectable()
export class MatchLogService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateMatchLogDto) {
    const profile = await this.requireProfile(userId);

    let opponentProfileId: string | undefined;
    if (dto.opponentId) {
      const opponentProfile = await this.prisma.playerProfile.findUnique({
        where: { userId: dto.opponentId },
        select: { id: true },
      });
      if (!opponentProfile) throw new NotFoundException('Opponent player not found');
      opponentProfileId = opponentProfile.id;
    }

    let playerWon: boolean | undefined;

    // For MATCH type: validate the score
    if (dto.type === 'MATCH' && dto.sets && dto.sets.length > 0) {
      const bestOf = dto.bestOf ?? 3;
      const result = validateTennisScore(dto.sets, bestOf);
      if (!result.valid) {
        throw new BadRequestException(`Invalid tennis score: ${result.error}`);
      }
      playerWon = result.winner === 1;
    } else if (dto.type === 'MATCH' && (!dto.sets || dto.sets.length === 0)) {
      // MATCH with no score is allowed (e.g. DNF or incomplete log)
    } else if (dto.type !== 'MATCH' && dto.sets && dto.sets.length > 0) {
      throw new BadRequestException('Score (sets) only applies to MATCH type entries');
    }

    return this.prisma.matchLogEntry.create({
      data: {
        playerId: profile.id,
        opponentId: opponentProfileId,
        opponentName: dto.opponentName,
        type: dto.type,
        date: new Date(dto.date),
        durationMins: dto.durationMins,
        location: dto.location,
        notes: dto.notes,
        setsData: dto.sets ? (dto.sets as any) : undefined,
        playerWon,
        bestOf: dto.bestOf ?? 3,
      },
      include: {
        opponent: { select: { displayName: true, level: true } },
      },
    });
  }

  async findMine(userId: string, page = 1, limit = 20) {
    const profile = await this.requireProfile(userId);
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      this.prisma.matchLogEntry.findMany({
        where: { playerId: profile.id },
        skip,
        take: limit,
        include: {
          opponent: { select: { displayName: true, level: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.matchLogEntry.count({ where: { playerId: profile.id } }),
    ]);

    return { data: entries, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const profile = await this.requireProfile(userId);
    const entry = await this.prisma.matchLogEntry.findUnique({
      where: { id },
      include: { opponent: { select: { displayName: true, level: true } } },
    });
    if (!entry) throw new NotFoundException('Match log entry not found');
    if (entry.playerId !== profile.id) throw new ForbiddenException('Access denied');
    return entry;
  }

  async delete(userId: string, id: string) {
    const profile = await this.requireProfile(userId);
    const entry = await this.prisma.matchLogEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Match log entry not found');
    if (entry.playerId !== profile.id) throw new ForbiddenException('Access denied');
    return this.prisma.matchLogEntry.delete({ where: { id } });
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Player profile not found');
    return profile;
  }
}
