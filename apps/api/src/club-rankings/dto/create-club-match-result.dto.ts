import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

class SetScoreDto {
  @Type(() => Number) winner!: number;
  @Type(() => Number) loser!: number;
}

export class CreateClubMatchResultDto {
  @IsOptional() @IsString() seasonId?: string;

  /** Roster entry ID of the winner */
  @IsOptional() @IsString() winnerRosterId?: string;
  @IsString() @MinLength(1) winnerNameRaw!: string;

  /** Roster entry ID of the loser */
  @IsOptional() @IsString() loserRosterId?: string;
  @IsString() @MinLength(1) loserNameRaw!: string;

  @IsString() @MinLength(1) categoryKey!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  setScores?: SetScoreDto[];

  @IsDateString() recordedAt!: string;
}
