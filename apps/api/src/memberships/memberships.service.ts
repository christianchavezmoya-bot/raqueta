import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembershipsService {
  constructor(private prisma: PrismaService) {}

  async findPlansByClub(clubId: string) {
    return this.prisma.membershipPlan.findMany({
      where: { clubId, active: true },
      orderBy: { price: 'asc' },
    });
  }

  async createPlan(clubId: string, data: any) {
    return this.prisma.membershipPlan.create({ data: { ...data, clubId } });
  }

  async updatePlan(planId: string, data: any) {
    return this.prisma.membershipPlan.update({ where: { id: planId }, data });
  }

  async assignMembership(data: { userId: string; clubId: string; planId: string; startDate: Date; endDate?: Date }) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: data.planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const existing = await this.prisma.membership.findFirst({
      where: { userId: data.userId, clubId: data.clubId, status: 'ACTIVE' },
    });
    if (existing) {
      await this.prisma.membership.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
    }

    return this.prisma.membership.create({ data: { ...data, status: 'ACTIVE' } });
  }

  async updateMembership(membershipId: string, data: any) {
    return this.prisma.membership.update({ where: { id: membershipId }, data });
  }

  async getUserMemberships(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { plan: true, club: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getActiveMembership(userId: string, clubId: string) {
    return this.prisma.membership.findFirst({
      where: { userId, clubId, status: 'ACTIVE' },
      include: { plan: true },
    });
  }

  async isMember(userId: string, clubId: string): Promise<boolean> {
    const m = await this.getActiveMembership(userId, clubId);
    return !!m;
  }
}
