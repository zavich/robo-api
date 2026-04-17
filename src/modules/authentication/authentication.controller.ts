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
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.signUpService.createUser(createUserDto);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
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
