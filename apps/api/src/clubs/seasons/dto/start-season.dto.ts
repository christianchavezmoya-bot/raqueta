import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';

export class DivisionConfigDto {
  @IsString() @MinLength(1) divisionKey!: string;
  @IsString() @MinLength(1) label!: string;
  @Type(() => Number) @IsInt() @Min(0) tierBasePoints!: number;
  @Type(() => Number) @IsInt() @Min(0) displayOrder!: number;
}

export class StartSeasonDto {
  @IsString() @MinLength(1) label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  carryForwardDecayPercent!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DivisionConfigDto)
  divisions?: DivisionConfigDto[];
}
