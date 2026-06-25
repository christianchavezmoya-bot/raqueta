import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClubAnnouncementDto {
  @ApiProperty({ example: 'Clases suspendidas por lluvia' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Las clases de hoy se reprogramar?n para ma?ana.' })
  @IsString()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
