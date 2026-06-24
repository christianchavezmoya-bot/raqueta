import { IsString, MinLength } from 'class-validator';

export class LinkRunDto {
  @IsString()
  @MinLength(1)
  value!: string;
}
