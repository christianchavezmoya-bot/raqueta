import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ensures actorUserId may perform a transacting action for the given
 * PlayerProfile id. Two paths are permitted:
 *
 *  self-acting  — actorUserId owns the PlayerProfile AND canTransact is true
 *  delegation   — an APPROVED ParentChildLink exists from actorUserId to the
 *                 profile's userId
 *
 * Returns 'self' or 'parent' so callers can store the correct actedByUserId.
 * Throws ForbiddenException for any other case.
 */
export async function assertCanActForPlayer(
  actorUserId: string,
  targetProfileId: string,
  prisma: PrismaService,
): Promise<'self' | 'parent'> {
  const profile = await prisma.playerProfile.findUnique({
    where: { id: targetProfileId },
    select: { userId: true, canTransact: true },
  });

  if (!profile) throw new ForbiddenException('Player profile not found');

  if (profile.userId === actorUserId) {
    if (!profile.canTransact) {
      throw new ForbiddenException(
        'This account is not permitted to make transactions. Contact a parent or staff.',
      );
    }
    return 'self';
  }

  const link = await prisma.parentChildLink.findFirst({
    where: {
      parentUserId: actorUserId,
      childUserId: profile.userId,
      status: 'APPROVED',
    },
  });

  if (!link) {
    throw new ForbiddenException(
      'You are not authorised to act on behalf of this player.',
    );
  }

  return 'parent';
}
