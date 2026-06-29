import { IsInt, IsOptional, IsString, MinLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AwardBonusDto {
  @IsString() @MinLength(1) seasonId!: string;
  @IsString() @MinLength(1) rosterId!: string;
  @IsString() @MinLength(1) bonusTypeId!: string;

  /**
   * Optional per-award override of the bonusType.points default. Negative
   * values are supported (penalties). When omitted, the bonusType.points
   * value is used. The actual delta is recorded on the breakdown endpoint
   * so the player can see exactly what changed their ranking.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  pointsOverride?: number;

  /** Free-text description explaining the award, e.g. "WO lesion rival" or "Conduct". */
  @IsOptional() @IsString() note?: string;
}
