import { IsEmail, IsString, MinLength } from 'class-validator';

export class AuthDto {
  @IsEmail()
  readonly email: string;

  @IsString()
  @MinLength(8)
  readonly password: string;
}
