import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';

export class ClubRankingRuleInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  categoryKey!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @Type(() => Number)
  @IsInt()
  winnerPoints!: number;

  @Type(() => Number)
  @IsInt()
  loserPoints!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertClubRankingRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClubRankingRuleInputDto)
  rules!: ClubRankingRuleInputDto[];
}
