import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Club favorites — a player can favorite any club, regardless of membership
 * or home-club status. Favoriting is purely a subscription/audience signal:
 *
 *   * It NEVER creates a ClubPlayerRoster entry.
 *   * It NEVER grants any club-scoped permission or visibility.
 *   * It ONLY adds the player to the audience for category-muted club
 *     announcements (subject to PlayerNotificationPreference filtering).
 *
 * Player endpoints are read-only at /players/me/favorites. Per-club
 * toggle endpoints live on the clubs controller at
 * POST /clubs/:id/favorites and DELETE /clubs/:id/favorites.
 */
@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Idempotently favorite a club for the given player. Returns the
   * created/existing favorite row and a `created` flag so callers can
   * distinguish a fresh favorite from a no-op.
   */
  async favorite(userId: string, clubId: string) {
    await this.ensureClubExists(clubId);

    const existing = await this.prisma.clubFavorite.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (existing) {
      return { favorite: existing, created: false };
    }

    const favorite = await this.prisma.clubFavorite.create({
      data: { userId, clubId },
    });
    return { favorite, created: true };
  }

  /**
   * Idempotently remove a favorite. No error if the row never existed —
   * callers (e.g. mobile favorite toggle) shouldn't have to handle 404.
   */
  async unfavorite(userId: string, clubId: string) {
    await this.ensureClubExists(clubId);

    const existing = await this.prisma.clubFavorite.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!existing) {
      return { removed: false };
    }

    await this.prisma.clubFavorite.delete({
      where: { userId_clubId: { userId, clubId } },
    });
    return { removed: true };
  }

  /**
   * List the full clubs the player has favorited, newest-first. Returns a
   * thin projection of each club so the mobile explore screen can render
   * a favorites filter without a second round trip.
   */
  async listForPlayer(userId: string) {
    const favorites = await this.prisma.clubFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            profile: {
              select: {
                logoUrl: true,
                city: true,
                latitude: true,
                longitude: true,
                accentColor: true,
              },
            },
          },
        },
      },
    });
    return favorites.map(f => ({
      id: f.id,
      clubId: f.clubId,
      createdAt: f.createdAt,
      club: f.club,
    }));
  }

  /**
   * Used by the mobile explore screen and the web club detail page to know
   * whether the current player has favorited a given club, in batch.
   */
  async favoritedClubIds(userId: string, clubIds: string[]): Promise<string[]> {
    if (clubIds.length === 0) return [];
    const rows = await this.prisma.clubFavorite.findMany({
      where: { userId, clubId: { in: clubIds } },
      select: { clubId: true },
    });
    return rows.map(row => row.clubId);
  }

  private async ensureClubExists(clubId: string) {
    const exists = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Club not found');
  }
}
