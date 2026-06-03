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
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { AuthDto } from './dto/auth.dto';
import { ApiKeyAuthGuard } from './guards/apikey-auth.guard';
import { LoginService } from './services/login.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SignUpService } from './services/sign-up.service';
import { CheckPermissions } from './decorators/check-permissions.decorator';
import { Public } from './decorators/public.decorator';
import { getPermissionsForRole } from './constants/permissions.constant';

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginService: LoginService,
    private readonly signUpService: SignUpService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  async login(
    @Body() loginUserDto: AuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.loginService.execute(loginUserDto);

    res.cookie('prosolutti_accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return { message: 'Login successful' };
  }

  @Post('signup')
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @UseGuards(ApiKeyAuthGuard)
  @CheckPermissions('user_management')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.signUpService.createUser(createUserDto);
  }

  @Post('logout')
  @HttpCode(200)
  @Public()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies?.prosolutti_accessToken;

    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf8'),
          ) as { jti?: string; exp?: number };

          // Validate jti format (UUID-like) to prevent Redis key pollution
          const jtiValid = typeof payload.jti === 'string' && /^[\w-]{8,128}$/.test(payload.jti);
          if (jtiValid && payload.exp) {
            const MAX_JWT_TTL = 24 * 60 * 60; // cap at 24h regardless of token claim
            const ttl = Math.min(payload.exp - Math.floor(Date.now() / 1000), MAX_JWT_TTL);
            if (ttl > 0) {
              await this.redis.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttl);
            }
          }
        }
      } catch {
        // Token malformado — prosseguir com o logout normalmente
      }
    }

    res.clearCookie('prosolutti_accessToken', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });

    return { message: 'Logout realizado com sucesso' };
  }

  @Get('me')
  @UseGuards(ApiKeyAuthGuard)
  getProfile(@Req() req: Request) {
    const user = (req as any).user;
    const permissions = user?.permissions ?? getPermissionsForRole(user?.role);
    return { ...user, permissions };
  }
}
