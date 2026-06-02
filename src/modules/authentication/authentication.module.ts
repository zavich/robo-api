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
import { JWT_ALGORITHM, SELF_ISSUER, TOKEN_TTL_SECONDS } from './jwt/jwt.constants';
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
        return {
          privateKey: normalizePem(config.get<string>('JWT_PRIVATE_KEY')),
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
