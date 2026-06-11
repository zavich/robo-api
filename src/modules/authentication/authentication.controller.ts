import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { AuthSchemaBody, authSchemaPipe } from './dto/auth.dto';
import { ApiKeyAuthGuard } from './guards/apikey-auth.guard';
import { LoginService } from './services/login.service';
import {
  CreateUserSchemaBody,
  createUserSchemaPipe,
} from './dto/create-user.dto';
import { SignUpService } from './services/sign-up.service';
import { CheckPermissions } from './decorators/check-permissions.decorator';
import { Public } from './decorators/public.decorator';
import { getPermissionsForRole } from './constants/permissions.constant';
import { AUTH_COOKIE_NAME, TOKEN_TTL_SECONDS } from './jwt/jwt.constants';
import {
  authCookieBaseOptions,
  authCookieSetOptions,
  sharedCookieClearOptions,
} from './jwt/auth-cookie';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginService: LoginService,
    private readonly signUpService: SignUpService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  async login(
    @Body(authSchemaPipe) loginUserDto: AuthSchemaBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.loginService.execute(loginUserDto);

    // Sessão PRÓPRIA: cookie `auth_token` HOST-ONLY (sem Domain=.juri.capital),
    // então não vaza para a juri-api. O SSO juri-api -> painel-robo continua
    // lendo o `auth_token` que a juri-api seta em `.juri.capital` (ver JwtStrategy).
    res.cookie(AUTH_COOKIE_NAME, accessToken, authCookieSetOptions());
    return { message: 'Login successful' };
  }

  @Post('signup')
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @UseGuards(ApiKeyAuthGuard)
  @CheckPermissions('user_management')
  async signUp(
    @Body(createUserSchemaPipe) createUserDto: CreateUserSchemaBody,
  ) {
    return this.signUpService.createUser(createUserDto);
  }

  @Post('logout')
  @HttpCode(200)
  @Public()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME];

    if (token) {
      try {
        // Verifica a assinatura (RS256, chave pública própria no JwtModule)
        // antes de confiar em jti/exp, pra não poluir a blocklist com lixo.
        const payload = this.jwtService.verify(token, {
          ignoreExpiration: true,
        }) as { jti?: string; exp?: number };
        const jtiValid =
          typeof payload.jti === 'string' && /^[\w-]{8,128}$/.test(payload.jti);
        if (jtiValid && payload.exp) {
          const ttl = Math.min(
            payload.exp - Math.floor(Date.now() / 1000),
            TOKEN_TTL_SECONDS,
          );
          if (ttl > 0) {
            await this.redis.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttl);
          }
        }
      } catch {
        // Assinatura inválida ou token malformado — segue o logout sem revogar.
      }
    }

    // Limpa o `auth_token` nos dois escopos possíveis (mesmas opções do set,
    // sem maxAge, senão o browser não casa o cookie):
    //  - host-only: a sessão própria desta API (login direto);
    //  - `.juri.capital`: o cookie compartilhado setado pela juri-api
    //    (single logout — deslogar aqui encerra a sessão do SSO).
    res.clearCookie(AUTH_COOKIE_NAME, authCookieBaseOptions());
    res.clearCookie(AUTH_COOKIE_NAME, sharedCookieClearOptions());

    return { message: 'Logout realizado com sucesso' };
  }

  @Get('me')
  @UseGuards(ApiKeyAuthGuard)
  getProfile(@Req() req: Request) {
    const user = req.user;
    const permissions =
      user?.permissions ?? getPermissionsForRole(user?.role ?? '');
    return { ...user, permissions };
  }
}
