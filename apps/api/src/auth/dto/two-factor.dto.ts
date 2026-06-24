import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2FADto {
  @ApiProperty({ example: 'abc123...', description: 'loginToken returned by /auth/login when 2FA is required' })
  @IsString()
  loginToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class Disable2FADto {
  @ApiProperty({ description: 'Current password (required to disable 2FA)' })
  @IsString()
  password: string;
}
