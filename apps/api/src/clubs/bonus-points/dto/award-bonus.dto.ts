import { IsOptional, IsString, MinLength } from 'class-validator';

export class AwardBonusDto {
  @IsString() @MinLength(1) seasonId!: string;
  @IsString() @MinLength(1) rosterId!: string;
  @IsString() @MinLength(1) bonusTypeId!: string;
  @IsOptional() @IsString() note?: string;
}
