import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
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

  async send(userId: string, title: string, message: string, type: NotificationType = 'GENERAL') {
    return this.prisma.notification.create({ data: { userId, title, message, type } });
  }

  async sendBulk(userIds: string[], title: string, message: string, type: NotificationType = 'GENERAL') {
    return this.prisma.notification.createMany({
      data: userIds.map(userId => ({ userId, title, message, type })),
    });
  }
}
