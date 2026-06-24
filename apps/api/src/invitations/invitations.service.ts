import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async sendInvitation(requesterId: string, recipientUserId: string, message?: string) {
    // Resolve sender's PlayerProfile
    const requesterProfile = await this.prisma.playerProfile.findUnique({
      where: { userId: requesterId },
      select: { id: true, displayName: true, publicVisibility: true },
    });
    if (!requesterProfile) throw new NotFoundException('Your player profile was not found');

    // Resolve recipient's PlayerProfile
    const recipientProfile = await this.prisma.playerProfile.findUnique({
      where: { userId: recipientUserId },
      select: { id: true, displayName: true, publicVisibility: true, availableForMatch: true },
    });
    if (!recipientProfile) throw new NotFoundException('Player not found');
    if (!recipientProfile.publicVisibility) throw new NotFoundException('Player not found');
    if (requesterProfile.id === recipientProfile.id) {
      throw new ForbiddenException('You cannot invite yourself');
    }

    // Block if there is already a pending invitation between this pair (either direction)
    const existing = await this.prisma.matchInvitation.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { requesterId: requesterProfile.id, recipientId: recipientProfile.id },
          { requesterId: recipientProfile.id, recipientId: requesterProfile.id },
        ],
      },
    });
    if (existing) {
      throw new ConflictException('A pending invitation already exists between you and this player');
    }

    const invitation = await this.prisma.matchInvitation.create({
      data: {
        requesterId: requesterProfile.id,
        recipientId: recipientProfile.id,
        message,
      },
    });

    // Notify recipient (fire-and-forget)
    this.notifications
      .send(
        recipientUserId,
        'Nueva invitación de partido',
        `${requesterProfile.displayName} te invitó a jugar un partido`,
        'MATCH_INVITATION_RECEIVED',
      )
      .catch(() => {});

    return invitation;
  }

  async getMyInvitations(userId: string) {
    const profile = await this.requireProfile(userId);

    const [received, sent] = await Promise.all([
      this.prisma.matchInvitation.findMany({
        where: { recipientId: profile.id },
        include: {
          requester: { select: { displayName: true, level: true, profilePhotoUrl: true, showPhotoInSearch: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.matchInvitation.findMany({
        where: { requesterId: profile.id },
        include: {
          recipient: { select: { displayName: true, level: true, profilePhotoUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // For accepted invitations in received: expose the requester's phone via their User
    const receivedWithPhone = await Promise.all(
      received.map(async inv => {
        let phone: string | null = null;
        if (inv.status === 'ACCEPTED') {
          const requesterUser = await this.prisma.user.findFirst({
            where: { playerProfile: { id: inv.requesterId } },
            select: { phone: true },
          });
          phone = requesterUser?.phone ?? null;
        }
        return {
          ...inv,
          requester: {
            ...inv.requester,
            // Honour showPhotoInSearch even in invitation context
            profilePhotoUrl: inv.requester.showPhotoInSearch ? inv.requester.profilePhotoUrl : null,
            phone,
          },
        };
      }),
    );

    return { received: receivedWithPhone, sent };
  }

  async accept(invitationId: string, userId: string) {
    const invitation = await this.requireInvitation(invitationId);
    const profile = await this.requireProfile(userId);

    if (invitation.recipientId !== profile.id) {
      throw new ForbiddenException('Only the recipient can accept this invitation');
    }
    if (invitation.status !== 'PENDING') {
      throw new ForbiddenException(`Invitation is already ${invitation.status.toLowerCase()}`);
    }

    const updated = await this.prisma.matchInvitation.update({
      where: { id: invitationId },
      data: { status: 'ACCEPTED' },
      include: { requester: { select: { displayName: true } } },
    });

    // Notify requester — include recipient's phone in the notification payload
    const recipientUser = await this.prisma.user.findFirst({
      where: { playerProfile: { id: profile.id } },
      select: { id: true, phone: true },
    });
    const requesterUser = await this.prisma.user.findFirst({
      where: { playerProfile: { id: invitation.requesterId } },
      select: { id: true },
    });

    if (requesterUser) {
      this.notifications
        .send(
          requesterUser.id,
          'Invitación aceptada',
          `${profile.displayName} aceptó tu invitación a jugar`,
          'MATCH_INVITATION_ACCEPTED',
        )
        .catch(() => {});
    }

    return updated;
  }

  async decline(invitationId: string, userId: string) {
    const invitation = await this.requireInvitation(invitationId);
    const profile = await this.requireProfile(userId);

    if (invitation.recipientId !== profile.id) {
      throw new ForbiddenException('Only the recipient can decline this invitation');
    }
    if (invitation.status !== 'PENDING') {
      throw new ForbiddenException(`Invitation is already ${invitation.status.toLowerCase()}`);
    }

    return this.prisma.matchInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' },
    });
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true },
    });
    if (!profile) throw new NotFoundException('Player profile not found');
    return profile;
  }

  private async requireInvitation(id: string) {
    const inv = await this.prisma.matchInvitation.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invitation not found');
    return inv;
  }
}
