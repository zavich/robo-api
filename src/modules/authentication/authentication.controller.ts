import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthDto } from './dto/auth.dto';
import { ApiKeyAuthGuard } from './guards/apikey-auth.guard';
import { LoginService } from './services/login.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SignUpService } from './services/sign-up.service';
import { AUTH_COOKIE_NAME } from './jwt/jwt.constants';
import { authCookieBaseOptions, authCookieSetOptions } from './jwt/auth-cookie';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginService: LoginService,
    private readonly signUpService: SignUpService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginUserDto: AuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.loginService.execute(loginUserDto);

    // cookie compartilhado do SSO (.juri.capital em produção)
    res.cookie(AUTH_COOKIE_NAME, accessToken, authCookieSetOptions());
    return { message: 'Login successful' };
  }

  @Post('signup')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.signUpService.createUser(createUserDto);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    // mesmas opções do set (sem maxAge), senão o browser não casa o cookie
    // e ele fica órfão no domínio .juri.capital
    res.clearCookie(AUTH_COOKIE_NAME, authCookieBaseOptions());

    return { message: 'Logout realizado com sucesso' };
  }
  @Get('me')
  @UseGuards(ApiKeyAuthGuard)
  getProfile(@Req() req: { user: { id: string } }) {
    return req.user;
  }
}
