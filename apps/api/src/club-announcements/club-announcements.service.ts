import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationCategory, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { CreateClubAnnouncementDto } from './dto/create-club-announcement.dto';

/**
 * Map each NotificationCategory onto the corresponding column on
 * PlayerNotificationPreference. The preference row uses snake-case column
 * names, while the enum is exposed as SCREAMING_SNAKE_CASE values.
 *
 * The four categories live ONLY on the category-mute path. Transactional
 * notifications (booking confirmations, 2FA codes, payment confirmations,
 * direct match invitations, parent/child approvals, role changes) never
 * call into this mapping — they keep going through the unconditional
 * `notifications.send()` path.
 */
const CATEGORY_PREFERENCE_COLUMN: Record<NotificationCategory, string> = {
  EVENTS: 'notifyEvents',
  OFFERS: 'notifyOffers',
  MEMBERSHIP_OFFERS: 'notifyMembershipOffers',
  MATCH_FINDING: 'notifyMatchFinding',
};

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
      this.resolveAudience(clubId, dto.category),
    ]);

    if (!club) throw new NotFoundException('Club not found');

    const announcement = await this.prisma.clubAnnouncement.create({
      data: {
        clubId,
        sentByUserId: actor.id,
        title: dto.title,
        body: dto.body,
        category: dto.category,
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
      category: dto.category,
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

  /**
   * Resolves the final delivery list for a given announcement.
   *
   * Pipeline:
   *   1. Build the BASE audience = ACTIVE memberships + home-club roster +
   *      players who have favorited the club, deduplicated by userId.
   *   2. Load the PlayerNotificationPreference row for every candidate.
   *      Players without a preference row keep every category (default TRUE).
   *   3. Drop anyone whose preference has the announcement's category muted.
   *
   * This is the ONLY path that touches PlayerNotificationPreference.
   * Transactional notifications (booking confirmations, 2FA codes, payment
   * confirmations, direct match invitations, parent/child approvals, role
   * changes) keep using the unconditional NotificationsService.send / sendBulk
   * methods, which never consult this table.
   */
  private async resolveAudience(clubId: string, category: NotificationCategory) {
    const [memberships, homeClubPlayers, favorites] = await Promise.all([
      this.prisma.membership.findMany({
        where: {
          clubId,
          status: 'ACTIVE',
          roster: {
            linkedPlayerProfile: {
              user: { status: 'ACTIVE' },
            },
          },
        },
        select: {
          roster: {
            select: {
              linkedPlayerProfile: {
                select: {
                  userId: true,
                  user: { select: { email: true } },
                },
              },
            },
          },
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
      this.prisma.clubFavorite.findMany({
        where: {
          clubId,
          user: { status: 'ACTIVE' },
        },
        select: {
          userId: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    const deduped = new Map<string, string | null>();
    for (const entry of memberships) {
      const linkedUser = entry.roster.linkedPlayerProfile;
      if (!linkedUser) continue;
      deduped.set(linkedUser.userId, linkedUser.user.email);
    }
    for (const entry of homeClubPlayers) {
      deduped.set(entry.userId, entry.user.email);
    }
    for (const entry of favorites) {
      deduped.set(entry.userId, entry.user.email);
    }

    const candidateIds = Array.from(deduped.keys());
    if (candidateIds.length === 0) {
      return { userIds: [], recipients: [] };
    }

    // Apply category-mute filter. Players with no preference row keep the
    // category (defaults to TRUE), so this only ever drops explicitly muted
    // players.
    const muteColumn = CATEGORY_PREFERENCE_COLUMN[category];
    const mutedRows = await this.prisma.playerNotificationPreference.findMany({
      where: {
        userId: { in: candidateIds },
        [muteColumn]: false,
      },
      select: { userId: true },
    });
    const mutedSet = new Set(mutedRows.map(row => row.userId));

    const finalUserIds = candidateIds.filter(userId => !mutedSet.has(userId));

    const recipients = finalUserIds
      .map(userId => {
        const email = deduped.get(userId);
        return email ? { userId, email } : null;
      })
      .filter((entry): entry is { userId: string; email: string } => entry !== null);

    return {
      userIds: finalUserIds,
      recipients,
    };
  }
}
