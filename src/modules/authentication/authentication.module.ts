import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './guards/jwt-strategy.guard';
import { User, UserSchema } from '../user/schema/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { LoginService } from './services/login.service';
import { AuthenticationController } from './authentication.controller';
import { SignUpService } from './services/sign-up.service';
import {
  JWT_ALGORITHM,
  SELF_ISSUER,
  TOKEN_TTL_SECONDS,
} from './jwt/jwt.constants';
import { normalizePem } from './jwt/jwt-keys';
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const privateKey = normalizePem(
          config.get<string>('JWT_PRIVATE_KEY_PAINEL_ROBO'),
        );
        // Falha cedo: sem a chave privada o módulo sobe "ok" mas todo
        // jwtService.sign() quebra em runtime (login/SSO) de forma pouco
        // diagnóstica. Melhor abortar o bootstrap com mensagem clara.
        if (!privateKey) {
          throw new Error(
            'JWT_PRIVATE_KEY_PAINEL_ROBO ausente: necessária para assinar tokens (RS256). Configure a env.',
          );
        }

        return {
          privateKey,
          signOptions: {
            algorithm: JWT_ALGORITHM,
            issuer: SELF_ISSUER,
            expiresIn: TOKEN_TTL_SECONDS,
          },
        };
      },
    }),
  ],
  controllers: [AuthenticationController],
  exports: [JwtStrategy, PassportModule],
  providers: [JwtStrategy, LoginService, SignUpService],
})
export class AuthenticationModule {}
