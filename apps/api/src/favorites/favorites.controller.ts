import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FavoritesService } from './favorites.service';

/**
 * Per-club favorite toggle endpoints. These are intentionally placed on the
 * clubs controller namespace (`/clubs/:id/favorites`) so the mobile UI can
 * just call them from the club detail / explore screen without extra routing
 * wiring. They accept ANY authenticated player — no club affiliation, no
 * roster entry, nothing.
 *
 * `POST` is idempotent: favoriting an already-favorited club is a no-op.
 * `DELETE` is idempotent: unfavoriting a non-favorited club is a no-op.
 */
@ApiTags('Club Favorites')
@Controller('clubs/:id/favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Favorite this club (idempotent). Any authenticated player.',
  })
  async favorite(
    @Param('id') clubId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.favorites.favorite(userId, clubId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfavorite this club (idempotent). Any authenticated player.',
  })
  async unfavorite(
    @Param('id') clubId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.favorites.unfavorite(userId, clubId);
  }
}
