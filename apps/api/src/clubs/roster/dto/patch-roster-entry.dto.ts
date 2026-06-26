import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class PatchRosterEntryDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() rut?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() suburb?: string;
  @IsOptional() @IsString() postcode?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() division?: string;
  /** Manually override the linked profile. Pass null to unlink. */
  @IsOptional() @IsString() linkedPlayerProfileId?: string | null;
  /** Explicit unlink flag — alternative to passing null in linkedPlayerProfileId */
  @IsOptional() @IsBoolean() unlink?: boolean;
}
