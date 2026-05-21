import { IsEmail } from 'class-validator';

export class AuthDto {
  @IsEmail()
  readonly email: string;
}
