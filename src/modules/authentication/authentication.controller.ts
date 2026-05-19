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

@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginService: LoginService,
    private readonly signUpService: SignUpService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async login(
    @Body() loginUserDto: AuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.loginService.execute(loginUserDto);

    res.cookie('prosolutti_accessToken', accessToken, {
      httpOnly: true,
      secure: true, // Railway = HTTPS sempre
      sameSite: 'none', // obrigatório porque é cross-site
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias em milissegundos
    });
    return { message: 'Login successful' };
  }

  @Post('signup')
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.signUpService.createUser(createUserDto);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies?.prosolutti_accessToken;

    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(
          Buffer.from(payloadBase64, 'base64').toString('utf8'),
        ) as { jti?: string; exp?: number };

        if (payload.jti && payload.exp) {
          const ttl = payload.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await this.redis.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttl);
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

    // você ainda pode invalidar o refreshToken no banco, se usar
    return { message: 'Logout realizado com sucesso' };
  }
  @Get('me')
  @UseGuards(ApiKeyAuthGuard)
  getProfile(@Req() req: { user: { id: string } }) {
    return req.user;
  }
}
