import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActingUser {
  id: string;
  role: Role;
  staffClubId?: string | null;
}

/**
 * Throws ForbiddenException unless the acting user is allowed to mutate
 * resources belonging to targetClubId.
 *
 * Rules:
 *   SUPER_ADMIN  — always passes (platform-wide access)
 *   CLUB_ADMIN   — passes if they own the club OR their staffClubId matches
 *   all others   — passes only if staffClubId matches
 */
export async function assertClubScope(
  actor: ActingUser,
  targetClubId: string,
  prisma: PrismaService,
): Promise<void> {
  if (actor.role === Role.SUPER_ADMIN) return;

  if (actor.staffClubId === targetClubId) return;

  if (actor.role === Role.CLUB_ADMIN) {
    const club = await prisma.club.findUnique({
      where: { id: targetClubId },
      select: { ownerUserId: true },
    });
    if (club?.ownerUserId === actor.id) return;
  }

  throw new ForbiddenException('You can only manage resources of your own club');
}
