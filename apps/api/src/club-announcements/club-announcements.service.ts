import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { CreateClubAnnouncementDto } from './dto/create-club-announcement.dto';

@Injectable()
export class ClubAnnouncementsService {
  private readonly logger = new Logger(ClubAnnouncementsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private email: EmailService,
  ) {}

  async create(clubId: string, dto: CreateClubAnnouncementDto, actor: ActingUser) {
    await assertClubScope(actor, clubId, this.prisma);

    const [club, audience] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: clubId },
        select: { id: true, name: true },
      }),
      this.resolveAudience(clubId),
    ]);

    if (!club) throw new NotFoundException('Club not found');

    const announcement = await this.prisma.clubAnnouncement.create({
      data: {
        clubId,
        sentByUserId: actor.id,
        title: dto.title,
        body: dto.body,
      },
    });

    if (audience.userIds.length > 0) {
      await this.notifications.sendBulk(
        audience.userIds,
        dto.title,
        dto.body,
        'GENERAL',
        { announcementId: announcement.id },
      );
    }

    if (dto.sendEmail && audience.recipients.length > 0) {
      void Promise.allSettled(
        audience.recipients.map(recipient =>
          this.email.sendAnnouncementEmail(recipient.email, club.name, dto.title, dto.body),
        ),
      ).then(results => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.warn(
              `Announcement email failed for ${audience.recipients[index].email}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
            );
          }
        });
      });
    }

    return {
      ...announcement,
      recipientCount: audience.userIds.length,
      emailRequested: !!dto.sendEmail,
    };
  }

  async findByClub(clubId: string, actor: ActingUser) {
    await assertClubScope(actor, clubId, this.prisma);
    return this.prisma.clubAnnouncement.findMany({
      where: { clubId },
      include: {
        sentByUser: {
          select: {
            id: true,
            email: true,
            playerProfile: { select: { displayName: true } },
          },
        },
        _count: { select: { notifications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async resolveAudience(clubId: string) {
    const [memberships, homeClubPlayers] = await Promise.all([
      this.prisma.membership.findMany({
        where: {
          clubId,
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
        },
        select: {
          userId: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.playerProfile.findMany({
        where: {
          homeClubId: clubId,
          user: { status: 'ACTIVE' },
        },
        select: {
          userId: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    const deduped = new Map<string, string | null>();
    for (const entry of [...memberships, ...homeClubPlayers]) {
      deduped.set(entry.userId, entry.user.email);
    }

    const recipients = Array.from(deduped.entries())
      .filter(entry => !!entry[1])
      .map(([userId, email]) => ({ userId, email: email as string }));

    return {
      userIds: Array.from(deduped.keys()),
      recipients,
    };
  }
}
