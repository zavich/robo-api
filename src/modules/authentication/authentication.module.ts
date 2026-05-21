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
import { RoleAuditService } from './services/role-audit.service';
import type { StringValue } from 'ms';
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
          secret: config.get<string>('JWT_SECRET_KEY'),
          signOptions: {
            expiresIn:
              (config.get<string>('JWT_EXPIRES_IN') as StringValue) ?? '1d',
          },
        };
      },
    }),
  ],
  controllers: [AuthenticationController],
  exports: [JwtStrategy, PassportModule],
  providers: [JwtStrategy, LoginService, SignUpService, RoleAuditService],
})
export class AuthenticationModule {}
