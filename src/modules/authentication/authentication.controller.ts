import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
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
import { SsoProvisioningService } from './services/sso-provisioning.service';
import { SsoTokenVerifierService } from './services/sso-token-verifier.service';
import { buildUserProfile } from './services/user-profile.util';
import { CheckPermissions } from './decorators/check-permissions.decorator';
import { Public } from './decorators/public.decorator';
import { getPermissionsForRole } from './constants/permissions.constant';
import {
  AUTH_COOKIE_NAME,
  JURI_ISSUER,
  SELF_COOKIE_NAME,
  TOKEN_TTL_SECONDS,
} from './jwt/jwt.constants';
import {
  selfCookieBaseOptions,
  selfCookieSetOptions,
  sharedCookieClearOptions,
} from './jwt/auth-cookie';
import { extractAuthToken } from './jwt/extract-token';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginService: LoginService,
    private readonly signUpService: SignUpService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly ssoTokenVerifier: SsoTokenVerifierService,
    private readonly ssoProvisioning: SsoProvisioningService,
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

    // Sessão PRÓPRIA: cookie `robo_auth_token` HOST-ONLY (sem Domain=.juri.capital),
    // então não vaza para a juri-api. O SSO juri-api -> painel-robo continua
    // lendo o `auth_token` que a juri-api seta em `.juri.capital` (ver JwtStrategy).
    res.cookie(SELF_COOKIE_NAME, accessToken, selfCookieSetOptions());
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
    // Revogação só faz sentido para o token PRÓPRIO (assinado por esta API, com
    // `jti`). Lê do cookie próprio `robo_auth_token` — determinístico, sem a
    // ambiguidade de cookies de mesmo nome. O cookie da juri-api (`auth_token`)
    // não é nosso para revogar; só é limpo abaixo.
    const token: string | undefined = req.cookies?.[SELF_COOKIE_NAME];

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

    // Limpa os dois cookies (mesmas opções do set, sem maxAge, senão o browser
    // não casa o cookie):
    //  - `robo_auth_token` host-only: a sessão própria desta API (login direto);
    //  - `auth_token` em `.juri.capital`: o cookie compartilhado da juri-api
    //    (single logout — deslogar aqui encerra a sessão do SSO).
    res.clearCookie(SELF_COOKIE_NAME, selfCookieBaseOptions());
    res.clearCookie(AUTH_COOKIE_NAME, sharedCookieClearOptions());

    return { message: 'Logout realizado com sucesso' };
  }

  /**
   * Bootstrap do SSO juri-api -> painel-robo. O front chama UMA vez logo após o
   * redirect do SSO. Aqui (e só aqui) o provisionamento JIT é permitido: a
   * robo-api tem banco próprio, então usuários reais da juri-api podem ainda não
   * existir localmente — em vez de criá-los um a um, criamos on-the-fly.
   *
   * É `@Public()` para não passar pelo guard global (que exige usuário já
   * existente): faz a verificação RS256 do token da juri por conta própria, sem
   * efeito colateral na camada de auth. `POST` porque a operação NÃO é safe
   * (escreve) — diferente do `GET /auth/me`, que voltou a ser somente leitura.
   */
  @Post('sso/session')
  @HttpCode(200)
  @Public()
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  async ssoSession(@Req() req: Request) {
    const token = extractAuthToken(req);
    if (!token) {
      throw new UnauthorizedException();
    }

    // Verifica assinatura/emissor/expiração (lança 401 se inválido).
    const payload = this.ssoTokenVerifier.verify(token);

    // Só tokens da juri-api provisionam sessão de SSO. Token próprio
    // (painel-robo) chegando aqui é anômalo — o usuário dele já existe.
    if (payload.iss !== JURI_ISSUER) {
      throw new UnauthorizedException();
    }

    const user = await this.ssoProvisioning.provisionFromSso(payload);
    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    return buildUserProfile(user);
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
