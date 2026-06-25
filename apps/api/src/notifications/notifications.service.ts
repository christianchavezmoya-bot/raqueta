import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
