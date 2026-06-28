import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationCategory } from '@prisma/client';

export class CreateClubAnnouncementDto {
  @ApiProperty({ example: 'Clases suspendidas por lluvia' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Las clases de hoy se reprogramarán para mañana.' })
  @IsString()
  @MaxLength(5000)
  body: string;

  @ApiProperty({
    enum: NotificationCategory,
    enumName: 'NotificationCategory',
    example: NotificationCategory.EVENTS,
    description:
      'Platform-defined category. Audience resolution mutes by this category ' +
      'using PlayerNotificationPreference. Direct transactional notifications ' +
      '(booking confirmations, 2FA codes, payment confirmations, direct match ' +
      'invitations, parent/child approvals, role changes) are never routed ' +
      'through this category.',
  })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
