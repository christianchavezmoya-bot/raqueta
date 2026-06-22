import { IsString, IsBoolean, IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SurfaceType, CourtBlockType } from '@prisma/client';

export class CreateCourtDto {
  @ApiProperty({ example: 'Cancha 1' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: SurfaceType })
  @IsEnum(SurfaceType)
  surfaceType: SurfaceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  indoor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lighting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class UpdateCourtDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(SurfaceType) surfaceType?: SurfaceType;
  @IsOptional() @IsBoolean() indoor?: boolean;
  @IsOptional() @IsBoolean() lighting?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() photoUrl?: string;
}

export class CreateCourtPricingDto {
  @ApiProperty({ example: 'MEMBER' })
  @IsString()
  userType: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  peakPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  offPeakPrice?: number;
}

export class CreateCourtBlockDto {
  @ApiProperty()
  @IsDateString()
  startTime: string;

  @ApiProperty()
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: CourtBlockType })
  @IsOptional()
  @IsEnum(CourtBlockType)
  blockType?: CourtBlockType;
}
