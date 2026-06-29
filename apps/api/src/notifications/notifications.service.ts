import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Default state when a player has never written a preferences row. Every
 * category is opt-in (TRUE) by default, so existing players keep getting
 * every category of announcement until they explicitly mute one.
 */
const DEFAULT_PREFERENCES = {
  notifyEvents: true,
  notifyOffers: true,
  notifyMembershipOffers: true,
  notifyMatchFinding: true,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async savePushToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });
    return { message: 'Push token registered' };
  }

  /**
   * Unconditional send path. Used for transactional notifications
   * (booking confirmations, 2FA codes, payment confirmations, direct match
   * invitations, parent/child approvals, role changes). These NEVER consult
   * PlayerNotificationPreference — they are not marketing/discovery noise.
   */
  async send(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'GENERAL',
    options?: { announcementId?: string },
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, message, type, announcementId: options?.announcementId },
    });

    // Fire-and-forget Expo push if user has a token
    this.sendExpoPush(userId, title, message).catch(err =>
      this.logger.warn(`Push failed for user ${userId}: ${err.message}`),
    );

    return notification;
  }

  /**
   * Bulk unconditional send path. Used by ClubAnnouncementsService AFTER the
   * category-mute filter has already trimmed the audience. This method does
   * not re-consult PlayerNotificationPreference — the audience is already
   * pre-filtered by the caller.
   */
  async sendBulk(
    userIds: string[],
    title: string,
    message: string,
    type: NotificationType = 'GENERAL',
    options?: { announcementId?: string },
  ) {
    const notifications = await this.prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        title,
        message,
        type,
        announcementId: options?.announcementId,
      })),
    });

    // Fire-and-forget push for all users with tokens
    Promise.all(userIds.map(id => this.sendExpoPush(id, title, message))).catch(() => {});

    return notifications;
  }

  /**
   * Read the current player's per-category notification preferences. If no
   * row exists yet (never mutated), returns the all-TRUE defaults so the UI
   * doesn't have to special-case "missing" state.
   */
  async getPreferences(userId: string) {
    const existing = await this.prisma.playerNotificationPreference.findUnique({
      where: { userId },
    });
    if (!existing) {
      return { userId, ...DEFAULT_PREFERENCES, updatedAt: null, isDefault: true };
    }
    return {
      userId: existing.userId,
      notifyEvents: existing.notifyEvents,
      notifyOffers: existing.notifyOffers,
      notifyMembershipOffers: existing.notifyMembershipOffers,
      notifyMatchFinding: existing.notifyMatchFinding,
      updatedAt: existing.updatedAt,
      isDefault: false,
    };
  }

  /**
   * Upsert per-category notification preferences. Any omitted field keeps
   * the existing value (or the default TRUE for a fresh row).
   *
   * IMPORTANT: this method only writes flags. It does NOT itself suppress
   * anything — the suppression is applied in ClubAnnouncementsService's
   * audience resolution, which is the single point where category muting
   * happens.
   */
  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const data: UpdateNotificationPreferencesDto = { ...dto };
    return this.prisma.playerNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        notifyEvents: data.notifyEvents ?? DEFAULT_PREFERENCES.notifyEvents,
        notifyOffers: data.notifyOffers ?? DEFAULT_PREFERENCES.notifyOffers,
        notifyMembershipOffers:
          data.notifyMembershipOffers ?? DEFAULT_PREFERENCES.notifyMembershipOffers,
        notifyMatchFinding:
          data.notifyMatchFinding ?? DEFAULT_PREFERENCES.notifyMatchFinding,
      },
      update: {
        ...(data.notifyEvents !== undefined ? { notifyEvents: data.notifyEvents } : {}),
        ...(data.notifyOffers !== undefined ? { notifyOffers: data.notifyOffers } : {}),
        ...(data.notifyMembershipOffers !== undefined
          ? { notifyMembershipOffers: data.notifyMembershipOffers }
          : {}),
        ...(data.notifyMatchFinding !== undefined
          ? { notifyMatchFinding: data.notifyMatchFinding }
          : {}),
      },
    });
  }

  /**
   * Bulk send with a structured data payload attached to each push message
   * (e.g. `{ type: 'TOURNAMENT_OPEN', tournamentId: '...' }`). The mobile
   * app's `useLastNotificationResponse` handler can inspect `data` to decide
   * where to route the user on tap.
   */
  async sendBulkWithData(
    userIds: string[],
    title: string,
    message: string,
    data: Record<string, unknown>,
    type: NotificationType = 'GENERAL',
  ) {
    await this.prisma.notification.createMany({
      data: userIds.map(userId => ({ userId, title, message, type })),
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, expoPushToken: { not: null } },
      select: { expoPushToken: true },
    });

    const validTokens = users
      .map(u => u.expoPushToken)
      .filter((t): t is string => !!t && t.startsWith('ExponentPushToken['));

    if (!validTokens.length) return;

    // Expo accepts batched messages
    const messages = validTokens.map(to => ({ to, title, body: message, sound: 'default', data }));

    fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    }).catch(err => this.logger.warn(`Bulk push failed: ${err.message}`));
  }

  private async sendExpoPush(userId: string, title: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) return;
    if (!user.expoPushToken.startsWith('ExponentPushToken[')) return;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: user.expoPushToken, title, body, sound: 'default' }),
    });

    if (!response.ok) {
      this.logger.warn(`Expo push HTTP error: ${response.status}`);
    }
  }
}
