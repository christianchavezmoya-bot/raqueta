import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ description: 'Explicit availability state. If omitted, the API toggles the current value.' })
  @IsOptional()
  @IsBoolean()
  availableForMatch?: boolean;

  @ApiPropertyOptional({ description: 'Current latitude, captured only while the player is actively available.' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Current longitude, captured only while the player is actively available.' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
