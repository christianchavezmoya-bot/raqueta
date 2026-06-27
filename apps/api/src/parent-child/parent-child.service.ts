import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParentChildLinkStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateAndNormalizeRut } from '../common/utils/rut';

@Injectable()
export class ParentChildService {
  constructor(private prisma: PrismaService) {}

  async requestLink(parentUserId: string, childRut: string) {
    let normalizedRut: string;
    try {
      normalizedRut = validateAndNormalizeRut(childRut);
    } catch {
      throw new BadRequestException('Invalid RUT format');
    }

    const childProfile = await this.prisma.playerProfile.findUnique({
      where: { rut: normalizedRut },
      select: { id: true, userId: true, homeClubId: true, displayName: true },
    });

    if (!childProfile) {
      throw new NotFoundException('No player found with that RUT');
    }

    if (childProfile.userId === parentUserId) {
      throw new BadRequestException('You cannot link your own account');
    }

    if (!childProfile.homeClubId) {
      throw new BadRequestException(
        'This player has no home club set. The club must register them first.',
      );
    }

    const existing = await this.prisma.parentChildLink.findFirst({
      where: {
        parentUserId,
        childUserId: childProfile.userId,
        status: ParentChildLinkStatus.APPROVED,
      },
    });
    if (existing) {
      throw new ConflictException('This link is already approved');
    }

    try {
      const link = await this.prisma.parentChildLink.create({
        data: {
          parentUserId,
          childUserId: childProfile.userId,
          clubId: childProfile.homeClubId,
          status: ParentChildLinkStatus.PENDING,
        },
        include: {
          child: { select: { playerProfile: { select: { displayName: true } } } },
          club: { select: { name: true } },
        },
      });

      return {
        id: link.id,
        status: link.status,
        childDisplayName: link.child.playerProfile?.displayName,
        clubName: link.club.name,
        requestedAt: link.requestedAt,
      };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('A pending request for this child already exists');
      }
      throw err;
    }
  }

  async listPendingForClub(
    actor: { id: string; role: Role; staffClubId?: string | null },
    clubId: string,
    status?: string,
  ) {
    if (actor.role !== Role.SUPER_ADMIN && actor.staffClubId !== clubId) {
      throw new ForbiddenException('You can only view links for your own club');
    }

    const where: any = { clubId };
    if (status && Object.values(ParentChildLinkStatus).includes(status as ParentChildLinkStatus)) {
      where.status = status as ParentChildLinkStatus;
    }

    return this.prisma.parentChildLink.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      include: {
        parent: { select: { id: true, email: true } },
        child: {
          select: {
            id: true,
            email: true,
            playerProfile: { select: { displayName: true, profilePhotoUrl: true } },
          },
        },
        approvedBy: { select: { id: true, email: true } },
      },
    });
  }

  async approveLink(
    actor: { id: string; role: Role; staffClubId?: string | null },
    linkId: string,
  ) {
    const link = await this.requirePendingLink(linkId);
    this.assertLinkClubScope(actor, link.clubId);

    return this.prisma.parentChildLink.update({
      where: { id: linkId },
      data: {
        status: ParentChildLinkStatus.APPROVED,
        approvedByUserId: actor.id,
        approvedAt: new Date(),
      },
      select: { id: true, status: true, approvedAt: true },
    });
  }

  async rejectLink(
    actor: { id: string; role: Role; staffClubId?: string | null },
    linkId: string,
  ) {
    const link = await this.requirePendingLink(linkId);
    this.assertLinkClubScope(actor, link.clubId);

    return this.prisma.parentChildLink.update({
      where: { id: linkId },
      data: { status: ParentChildLinkStatus.REJECTED },
      select: { id: true, status: true },
    });
  }

  async listMyChildren(parentUserId: string) {
    const links = await this.prisma.parentChildLink.findMany({
      where: { parentUserId },
      orderBy: { requestedAt: 'desc' },
      include: {
        child: {
          select: {
            id: true,
            email: true,
            playerProfile: {
              select: {
                id: true,
                displayName: true,
                profilePhotoUrl: true,
                level: true,
                canTransact: true,
                homeClub: { select: { id: true, name: true } },
              },
            },
          },
        },
        club: { select: { id: true, name: true } },
      },
    });

    return links.map(l => ({
      linkId: l.id,
      status: l.status,
      requestedAt: l.requestedAt,
      approvedAt: l.approvedAt,
      club: l.club,
      child: {
        userId: l.child.id,
        email: l.child.email,
        profile: l.child.playerProfile,
      },
    }));
  }

  async toggleTransact(
    actor: { id: string; role: Role; staffClubId?: string | null },
    childUserId: string,
    canTransact: boolean,
  ) {
    const isParent = await this.prisma.parentChildLink.findFirst({
      where: {
        parentUserId: actor.id,
        childUserId,
        status: ParentChildLinkStatus.APPROVED,
      },
    });

    if (!isParent) {
      const childProfile = await this.prisma.playerProfile.findUnique({
        where: { userId: childUserId },
        select: { homeClubId: true },
      });

      const isClubStaff =
        actor.role === Role.SUPER_ADMIN ||
        (childProfile?.homeClubId && childProfile.homeClubId === actor.staffClubId);

      if (!isClubStaff) {
        throw new ForbiddenException(
          'Only the linked parent or the child\'s home club staff can toggle this setting',
        );
      }
    }

    const profile = await this.prisma.playerProfile.update({
      where: { userId: childUserId },
      data: { canTransact },
      select: { userId: true, displayName: true, canTransact: true },
    });

    return profile;
  }

  private async requirePendingLink(linkId: string) {
    const link = await this.prisma.parentChildLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.status !== ParentChildLinkStatus.PENDING) {
      throw new BadRequestException(`Link is already ${link.status.toLowerCase()}`);
    }
    return link;
  }

  private assertLinkClubScope(
    actor: { id: string; role: Role; staffClubId?: string | null },
    clubId: string,
  ) {
    if (actor.role !== Role.SUPER_ADMIN && actor.staffClubId !== clubId) {
      throw new ForbiddenException('You can only manage links for your own club');
    }
  }
}
