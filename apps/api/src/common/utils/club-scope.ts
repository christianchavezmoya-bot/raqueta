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
 * resources belonging to targetClubId, AND the club is not in a locked/expired
 * trial state. SUPER_ADMIN bypasses both checks.
 *
 * Rules:
 *   SUPER_ADMIN  — always passes (platform-wide access)
 *   CLUB_ADMIN   — passes if they own the club OR their staffClubId matches, and club is writable
 *   all others   — passes only if staffClubId matches, and club is writable
 */
export async function assertClubScope(
  actor: ActingUser,
  targetClubId: string,
  prisma: PrismaService,
): Promise<void> {
  if (actor.role === Role.SUPER_ADMIN) return;

  const club = await prisma.club.findUnique({
    where: { id: targetClubId },
    select: { ownerUserId: true, status: true, trialEndsAt: true },
  });

  // Access-control check
  if (actor.staffClubId !== targetClubId) {
    if (actor.role === Role.CLUB_ADMIN && club?.ownerUserId === actor.id) {
      // CLUB_ADMIN owns this club — falls through to trial check below
    } else {
      throw new ForbiddenException('You can only manage resources of your own club');
    }
  }

  // Trial / locked check (applies to all non-SUPER_ADMIN roles)
  if (club) {
    assertNotLocked(club);
  }
}

function assertNotLocked(club: { status: string; trialEndsAt: Date | null }) {
  if (club.status === 'LOCKED') {
    throw new ForbiddenException(
      'Trial period has expired and this club is locked. Contact support to reactivate.',
    );
  }
  if (club.status === 'TRIAL' && club.trialEndsAt && club.trialEndsAt < new Date()) {
    throw new ForbiddenException(
      'Trial period has ended. Contact support to upgrade and reactivate your club.',
    );
  }
}
