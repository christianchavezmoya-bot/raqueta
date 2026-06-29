import { IsEmail, IsString, MinLength, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Tomás' })
  @IsString()
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'Arancibia' })
  @IsString()
  @MaxLength(80)
  lastName: string;

  @ApiPropertyOptional({
    example: '1992-04-12',
    description: 'Fecha de nacimiento (YYYY-MM-DD). Opcional pero habilita el auto-match con el roster del club.',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ example: 'Tomás Arancibia', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: '+56912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  /** Optional home-club id. Linked roster matches still surface even if this is omitted. */
  @ApiPropertyOptional({ example: '081dc4ce-f150-4f2e-a43d-a332a29b68de' })
  @IsOptional()
  @IsString()
  homeClubId?: string;
}
