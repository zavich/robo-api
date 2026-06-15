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
import { SsoProvisioningService } from './services/sso-provisioning.service';
import { SsoTokenVerifierService } from './services/sso-token-verifier.service';
import {
  JWT_ALGORITHM,
  SELF_ISSUER,
  TOKEN_TTL_SECONDS,
} from './jwt/jwt.constants';
import { normalizePem } from './jwt/jwt-keys';
import { ssoPublicKeysProvider } from './jwt/sso-public-keys.provider';
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
          config.get<string>('JWT_PRIVATE_KEY_ROBO_API'),
        );
        // Chave pública própria: usada para VERIFICAR tokens emitidos por esta
        // API (ex.: revogação no logout). Como a assinatura é RS256, a chave de
        // verificação é diferente da de assinatura.
        const publicKey = normalizePem(
          config.get<string>('JWT_PUBLIC_KEY_ROBO_API'),
        );
        // Falha cedo: sem a chave privada o módulo sobe "ok" mas todo
        // jwtService.sign() quebra em runtime (login/SSO) de forma pouco
        // diagnóstica. Melhor abortar o bootstrap com mensagem clara.
        // Em testes (NODE_ENV=test) não abortamos: o AppModule sempre importa
        // este módulo e a suíte não exercita assinatura/SSO.
        if (!privateKey && process.env.NODE_ENV !== 'test') {
          throw new Error(
            'JWT_PRIVATE_KEY_ROBO_API ausente: necessária para assinar tokens (RS256). Configure a env.',
          );
        }

        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: JWT_ALGORITHM,
            issuer: SELF_ISSUER,
            expiresIn: TOKEN_TTL_SECONDS,
          },
          verifyOptions: {
            algorithms: [JWT_ALGORITHM],
            issuer: SELF_ISSUER,
          },
        };
      },
    }),
  ],
  controllers: [AuthenticationController],
  exports: [JwtStrategy, PassportModule],
  providers: [
    JwtStrategy,
    LoginService,
    SignUpService,
    RoleAuditService,
    SsoProvisioningService,
    SsoTokenVerifierService,
    ssoPublicKeysProvider,
  ],
})
export class AuthenticationModule {}
