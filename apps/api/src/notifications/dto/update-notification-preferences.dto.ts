import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Partial-update DTO for PlayerNotificationPreference. Any field left out
 * keeps its current value (or the default TRUE if the row has never been
 * written). Use the GET endpoint to load the current full state.
 *
 * The four booleans here are the ONLY knobs on this system. Transactional
 * notifications (booking confirmations, 2FA codes, payment confirmations,
 * direct match invitations, parent/child approvals, role changes) are
 * never affected by these flags.
 */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyEvents?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyOffers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyMembershipOffers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyMatchFinding?: boolean;
}
