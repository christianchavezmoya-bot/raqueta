import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRequestStatus, MembershipStatus, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { validateAndNormalizeRut } from '../common/utils/rut';

type MembershipPlanInput = {
  name?: string;
  description?: string | null;
  price?: number;
  billingPeriod?: string;
  benefits?: string[];
  active?: boolean;
  paymentInstructions?: string | null;
};

type AssignMembershipInput = {
  clubId?: string;
  planId: string;
  rosterId?: string;
  userId?: string;
  playerProfileId?: string;
  startDate?: string | Date;
  endDate?: string | Date | null;
  firstName?: string;
  lastName?: string;
  rut?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
};

type MembershipRequestInput = {
  planId: string;
};

type ApproveMembershipRequestInput = {
  startDate?: string | Date;
  endDate?: string | Date | null;
};

type DenyMembershipRequestInput = {
  reason?: string;
};

@Injectable()
export class MembershipsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findPlansByClub(clubId: string, options: { includeInactive?: boolean } = {}) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        profile: { select: { defaultPaymentInstructions: true } },
        membershipPlans: {
          where: options.includeInactive ? undefined : { active: true },
          orderBy: [{ active: 'desc' }, { price: 'asc' }],
        },
      },
    });

    if (!club) throw new NotFoundException('Club not found');

    const fallback = club.profile?.defaultPaymentInstructions ?? null;
    return club.membershipPlans.map(plan => this.serializePlan(plan, fallback));
  }

  async createPlan(clubId: string, data: MembershipPlanInput, actor: ActingUser) {
    await assertClubScope(actor, clubId, this.prisma);
    return this.prisma.membershipPlan.create({
      data: {
        clubId,
        name: this.requireText(data.name, 'Plan name'),
        description: this.optionalText(data.description),
        price: this.requireNumber(data.price, 'Plan price'),
        billingPeriod: this.requireText(data.billingPeriod, 'Billing period') as any,
        benefits: Array.isArray(data.benefits) ? data.benefits.filter(Boolean) : [],
        active: data.active ?? true,
        paymentInstructions: this.optionalText(data.paymentInstructions),
      },
    });
  }

  async updatePlan(planId: string, data: MembershipPlanInput, actor: ActingUser) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
      select: { id: true, clubId: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    await assertClubScope(actor, plan.clubId, this.prisma);

    return this.prisma.membershipPlan.update({
      where: { id: planId },
      data: {
        ...(data.name !== undefined ? { name: this.requireText(data.name, 'Plan name') } : {}),
        ...(data.description !== undefined ? { description: this.optionalText(data.description) } : {}),
        ...(data.price !== undefined ? { price: this.requireNumber(data.price, 'Plan price') } : {}),
        ...(data.billingPeriod !== undefined ? { billingPeriod: this.requireText(data.billingPeriod, 'Billing period') as any } : {}),
        ...(Array.isArray(data.benefits) ? { benefits: data.benefits.filter(Boolean) } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.paymentInstructions !== undefined
          ? { paymentInstructions: this.optionalText(data.paymentInstructions) }
          : {}),
      },
    });
  }

  async assignMembership(data: AssignMembershipInput, actor: ActingUser) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: data.planId },
      include: { club: { include: { profile: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const clubId = data.clubId ?? plan.clubId;
    if (clubId !== plan.clubId) {
      throw new BadRequestException('Plan does not belong to the selected club');
    }

    await assertClubScope(actor, clubId, this.prisma);

    const roster = await this.resolveRosterForAssignment(clubId, data);
    const startDate = this.parseDate(data.startDate, new Date());
    const endDate = this.parseOptionalDate(data.endDate);

    await this.cancelExistingActiveMembership(clubId, roster.id);

    const membership = await this.prisma.membership.create({
      data: {
        clubId,
        rosterId: roster.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate,
        endDate,
      },
      include: this.membershipInclude(),
    });

    if (membership.roster.linkedPlayerProfile?.userId) {
      await this.notifications.send(
        membership.roster.linkedPlayerProfile.userId,
        'Membresía activada',
        `Tu membresía ${membership.plan.name} en ${membership.club.name} ya está activa.`,
      );
    }

    return this.serializeMembership(membership);
  }

  async updateMembership(membershipId: string, data: Partial<AssignMembershipInput> & { status?: MembershipStatus }, actor: ActingUser) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { plan: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    await assertClubScope(actor, membership.clubId, this.prisma);

    let planId = membership.planId;
    if (data.planId && data.planId !== membership.planId) {
      const nextPlan = await this.prisma.membershipPlan.findUnique({ where: { id: data.planId } });
      if (!nextPlan) throw new NotFoundException('Plan not found');
      if (nextPlan.clubId !== membership.clubId) {
        throw new BadRequestException('Plan does not belong to the same club');
      }
      planId = nextPlan.id;
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        planId,
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.startDate !== undefined ? { startDate: this.parseDate(data.startDate, membership.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: this.parseOptionalDate(data.endDate) } : {}),
      },
      include: this.membershipInclude(),
    });

    return this.serializeMembership(updated);
  }

  async cancelMembership(membershipId: string, actor: ActingUser) {
    return this.updateMembership(membershipId, { status: 'CANCELLED' }, actor);
  }

  async getUserMemberships(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        roster: {
          linkedPlayerProfile: {
            userId,
          },
        },
      },
      include: this.membershipInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return memberships.map(membership => this.serializeMembership(membership));
  }

  async getActiveMembership(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        clubId,
        status: 'ACTIVE',
        roster: {
          linkedPlayerProfile: {
            userId,
          },
        },
      },
      include: this.membershipInclude(),
      orderBy: { startDate: 'desc' },
    });

    return membership ? this.serializeMembership(membership) : null;
  }

  async isMember(userId: string, clubId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        clubId,
        status: 'ACTIVE',
        roster: {
          linkedPlayerProfile: {
            userId,
          },
        },
      },
      select: { id: true },
    });
    return !!membership;
  }

  async createMembershipRequest(clubId: string, requestedByUserId: string, body: MembershipRequestInput) {
    const [plan, profile] = await Promise.all([
      this.prisma.membershipPlan.findUnique({
        where: { id: body.planId },
        include: { club: { include: { profile: true } } },
      }),
      this.prisma.playerProfile.findUnique({
        where: { userId: requestedByUserId },
        select: { id: true },
      }),
    ]);

    if (!plan || plan.clubId !== clubId) {
      throw new NotFoundException('Plan not found');
    }
    if (!plan.active) throw new BadRequestException('Selected plan is inactive');
    if (!profile) throw new NotFoundException('Player profile not found');

    const alreadyMember = await this.prisma.membership.findFirst({
      where: {
        clubId,
        status: 'ACTIVE',
        roster: {
          linkedPlayerProfile: {
            userId: requestedByUserId,
          },
        },
      },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictException('You already have an active membership at this club');

    const existingPending = await this.prisma.membershipRequest.findFirst({
      where: { clubId, requestedByUserId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException('You already have a pending request for this club');
    }

    const request = await this.prisma.membershipRequest.create({
      data: {
        clubId,
        planId: plan.id,
        requestedByUserId,
      },
      include: this.membershipRequestInclude(),
    });

    return this.serializeMembershipRequest(request);
  }

  async getMyMembershipRequests(userId: string) {
    const requests = await this.prisma.membershipRequest.findMany({
      where: { requestedByUserId: userId },
      include: this.membershipRequestInclude(),
      orderBy: { requestedAt: 'desc' },
    });

    return requests.map(request => this.serializeMembershipRequest(request));
  }

  async getClubMembershipRequests(clubId: string, actor: ActingUser, status?: MembershipRequestStatus) {
    await assertClubScope(actor, clubId, this.prisma);

    const requests = await this.prisma.membershipRequest.findMany({
      where: {
        clubId,
        ...(status ? { status } : {}),
      },
      include: this.membershipRequestInclude(),
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    });

    return requests.map(request => this.serializeMembershipRequest(request));
  }

  async approveMembershipRequest(requestId: string, actor: ActingUser, body: ApproveMembershipRequestInput = {}) {
    const request = await this.prisma.membershipRequest.findUnique({
      where: { id: requestId },
      include: this.membershipRequestInclude(),
    });
    if (!request) throw new NotFoundException('Membership request not found');
    await assertClubScope(actor, request.clubId, this.prisma);

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const roster = await this.resolveRosterForRegisteredPlayer(request.clubId, {
      userId: request.requestedByUserId,
    });

    await this.cancelExistingActiveMembership(request.clubId, roster.id);

    const membership = await this.prisma.membership.create({
      data: {
        clubId: request.clubId,
        rosterId: roster.id,
        planId: request.planId,
        status: 'ACTIVE',
        startDate: this.parseDate(body.startDate, new Date()),
        endDate: this.parseOptionalDate(body.endDate),
      },
      include: this.membershipInclude(),
    });

    await this.prisma.membershipRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        decidedAt: new Date(),
        decidedByUserId: actor.id,
        denialReason: null,
      },
    });

    await this.notifications.send(
      request.requestedByUserId,
      'Solicitud aprobada',
      `Tu solicitud de membresía ${membership.plan.name} en ${membership.club.name} fue aprobada.`,
    );

    return this.serializeMembership(membership);
  }

  async denyMembershipRequest(requestId: string, actor: ActingUser, body: DenyMembershipRequestInput) {
    const request = await this.prisma.membershipRequest.findUnique({
      where: { id: requestId },
      include: this.membershipRequestInclude(),
    });
    if (!request) throw new NotFoundException('Membership request not found');
    await assertClubScope(actor, request.clubId, this.prisma);

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be denied');
    }

    const denialReason = this.requireText(body.reason, 'Denial reason');
    const denied = await this.prisma.membershipRequest.update({
      where: { id: requestId },
      data: {
        status: 'DENIED',
        decidedAt: new Date(),
        decidedByUserId: actor.id,
        denialReason,
      },
      include: this.membershipRequestInclude(),
    });

    await this.notifications.send(
      request.requestedByUserId,
      'Solicitud rechazada',
      `Tu solicitud de membresía en ${request.club.name} fue rechazada. Motivo: ${denialReason}`,
    );

    return this.serializeMembershipRequest(denied);
  }

  async cancelMembershipRequest(requestId: string, userId: string) {
    const request = await this.prisma.membershipRequest.findUnique({
      where: { id: requestId },
      include: this.membershipRequestInclude(),
    });
    if (!request) throw new NotFoundException('Membership request not found');
    if (request.requestedByUserId !== userId) {
      throw new ForbiddenException('You can only cancel your own membership requests');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    await this.prisma.membershipRequest.delete({ where: { id: requestId } });
    return { message: 'Membership request cancelled' };
  }

  private membershipInclude() {
    return {
      plan: true,
      club: { include: { profile: true } },
      roster: {
        include: {
          linkedPlayerProfile: {
            include: {
              user: {
                select: { id: true, email: true, phone: true },
              },
            },
          },
        },
      },
    } satisfies Prisma.MembershipInclude;
  }

  private membershipRequestInclude() {
    return {
      club: { include: { profile: true } },
      plan: true,
      requestedByUser: {
        select: {
          id: true,
          email: true,
          phone: true,
          playerProfile: {
            select: {
              id: true,
              displayName: true,
              rut: true,
              profilePhotoUrl: true,
            },
          },
        },
      },
      decidedByUser: {
        select: {
          id: true,
          email: true,
          playerProfile: { select: { displayName: true } },
        },
      },
    } satisfies Prisma.MembershipRequestInclude;
  }

  private serializePlan(plan: any, fallbackInstructions: string | null) {
    return {
      ...plan,
      resolvedPaymentInstructions: plan.paymentInstructions ?? fallbackInstructions ?? null,
    };
  }

  private serializeMembership(membership: any) {
    return {
      ...membership,
      plan: this.serializePlan(
        membership.plan,
        membership.club?.profile?.defaultPaymentInstructions ?? null,
      ),
      resolvedPaymentInstructions:
        membership.plan?.paymentInstructions
        ?? membership.club?.profile?.defaultPaymentInstructions
        ?? null,
    };
  }

  private serializeMembershipRequest(request: any) {
    return {
      ...request,
      plan: this.serializePlan(
        request.plan,
        request.club?.profile?.defaultPaymentInstructions ?? null,
      ),
      resolvedPaymentInstructions:
        request.plan?.paymentInstructions
        ?? request.club?.profile?.defaultPaymentInstructions
        ?? null,
    };
  }

  private async resolveRosterForAssignment(clubId: string, data: AssignMembershipInput) {
    if (data.rosterId) {
      const roster = await this.prisma.clubPlayerRoster.findFirst({
        where: { id: data.rosterId, clubId },
        include: {
          linkedPlayerProfile: {
            include: { user: { select: { id: true, email: true, phone: true } } },
          },
        },
      });
      if (!roster) throw new NotFoundException('Roster entry not found');
      return roster;
    }

    if (data.userId || data.playerProfileId) {
      return this.resolveRosterForRegisteredPlayer(clubId, {
        userId: data.userId,
        playerProfileId: data.playerProfileId,
      });
    }

    return this.resolveRosterForManualEntry(clubId, data);
  }

  private async resolveRosterForRegisteredPlayer(
    clubId: string,
    data: { userId?: string; playerProfileId?: string },
  ) {
    const profile = await this.prisma.playerProfile.findFirst({
      where: data.playerProfileId ? { id: data.playerProfileId } : { userId: data.userId },
      include: {
        user: { select: { id: true, email: true, phone: true } },
      },
    });
    if (!profile) throw new NotFoundException('Player profile not found');

    const existingLinked = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, linkedPlayerProfileId: profile.id },
      include: {
        linkedPlayerProfile: {
          include: { user: { select: { id: true, email: true, phone: true } } },
        },
      },
    });
    if (existingLinked) return existingLinked;

    if (profile.rut) {
      const byRut = await this.prisma.clubPlayerRoster.findFirst({
        where: { clubId, rut: profile.rut },
        include: {
          linkedPlayerProfile: {
            include: { user: { select: { id: true, email: true, phone: true } } },
          },
        },
      });

      if (byRut?.linkedPlayerProfileId && byRut.linkedPlayerProfileId !== profile.id) {
        throw new ConflictException('Another player is already linked to that roster RUT');
      }

      if (byRut) {
        return this.prisma.clubPlayerRoster.update({
          where: { id: byRut.id },
          data: { linkedPlayerProfileId: profile.id },
          include: {
            linkedPlayerProfile: {
              include: { user: { select: { id: true, email: true, phone: true } } },
            },
          },
        });
      }
    }

    const [firstName, lastName] = this.splitDisplayName(profile.displayName, profile.user.email);

    return this.prisma.clubPlayerRoster.create({
      data: {
        clubId,
        firstName,
        lastName,
        rut: profile.rut,
        phone: profile.user.phone,
        linkedPlayerProfileId: profile.id,
      },
      include: {
        linkedPlayerProfile: {
          include: { user: { select: { id: true, email: true, phone: true } } },
        },
      },
    });
  }

  private async resolveRosterForManualEntry(clubId: string, data: AssignMembershipInput) {
    const firstName = this.requireText(data.firstName, 'First name');
    const lastName = this.requireText(data.lastName, 'Last name');
    const normalizedRut = data.rut ? validateAndNormalizeRut(data.rut) : null;

    if (normalizedRut) {
      const existing = await this.prisma.clubPlayerRoster.findFirst({
        where: { clubId, rut: normalizedRut },
        include: {
          linkedPlayerProfile: {
            include: { user: { select: { id: true, email: true, phone: true } } },
          },
        },
      });

      if (existing) {
        return this.prisma.clubPlayerRoster.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName,
            phone: this.optionalText(data.phone),
            address: this.optionalText(data.address),
            city: this.optionalText(data.city),
          },
          include: {
            linkedPlayerProfile: {
              include: { user: { select: { id: true, email: true, phone: true } } },
            },
          },
        });
      }
    }

    return this.prisma.clubPlayerRoster.create({
      data: {
        clubId,
        firstName,
        lastName,
        rut: normalizedRut,
        phone: this.optionalText(data.phone),
        address: this.optionalText(data.address),
        city: this.optionalText(data.city),
      },
      include: {
        linkedPlayerProfile: {
          include: { user: { select: { id: true, email: true, phone: true } } },
        },
      },
    });
  }

  private async cancelExistingActiveMembership(clubId: string, rosterId: string) {
    await this.prisma.membership.updateMany({
      where: { clubId, rosterId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
  }

  private splitDisplayName(displayName: string, email: string): [string, string] {
    const trimmed = displayName.trim();
    if (!trimmed) return [email.split('@')[0] || 'Jugador', '-'];

    const [firstName, ...rest] = trimmed.split(/\s+/);
    return [firstName, rest.join(' ') || '-'];
  }

  private requireText(value: string | undefined | null, label: string) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BadRequestException(`${label} is required`);
    return text;
  }

  private optionalText(value: string | undefined | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const text = value.trim();
    return text.length ? text : null;
  }

  private requireNumber(value: number | undefined, label: string) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(`${label} is required`);
    }
    return value;
  }

  private parseDate(value: string | Date | undefined, fallback: Date) {
    if (value === undefined) return fallback;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date value');
    return parsed;
  }

  private parseOptionalDate(value: string | Date | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date value');
    return parsed;
  }
}
