import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

class SetScoreDto {
  @Type(() => Number)
  winner!: number;

  @Type(() => Number)
  loser!: number;
}

export class CreateClubMatchResultDto {
  @IsOptional()
  @IsString()
  winnerPlayerId?: string;

  @IsString()
  @MinLength(1)
  winnerNameRaw!: string;

  @IsOptional()
  @IsString()
  loserPlayerId?: string;

  @IsString()
  @MinLength(1)
  loserNameRaw!: string;

  @IsString()
  @MinLength(1)
  categoryKey!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  setScores?: SetScoreDto[];

  @IsDateString()
  recordedAt!: string;
}
