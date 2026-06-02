import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import { AUTH_COOKIE_NAME, JWT_ALGORITHM } from '../jwt/jwt.constants';
import { buildPublicKeyMap, readIssuer } from '../jwt/jwt-keys';

/**
 * Payload no formato do contrato de SSO. A juri-api emite a mesma forma,
 * por isso a robo-api lê `payload.user` independente de quem assinou.
 */
export type iJwtPayload = {
  sub: string;
  user: {
    email: string;
    nome?: string;
    sobreNome?: string;
    cargo?: string;
    permissoes?: string[];
  };
};

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.[AUTH_COOKIE_NAME] || null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    configService: ConfigService,
  ) {
    const publicKeys = buildPublicKeyMap({
      publicKeyPainelRobo: configService.get<string>(
        'JWT_PUBLIC_KEY_PAINEL_ROBO',
      ),
      publicKeyApi: configService.get<string>('JWT_PUBLIC_KEY_API'),
    });

    super({
      // aceita o token tanto via header Authorization: Bearer quanto via cookie
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      // escolhe a chave pública pelo issuer do token (validação multi-emissor)
      secretOrKeyProvider: (
        _req: Request,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        const iss = readIssuer(rawJwtToken);
        const key = iss ? publicKeys[iss] : undefined;
        if (!key) {
          return done(new UnauthorizedException('JWT issuer não reconhecido'));
        }
        return done(null, key);
      },
    });
  }

  async validate(payload: iJwtPayload) {
    const email = payload?.user?.email?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException();
    }

    // Resolução de identidade por email (decisão de arquitetura do SSO).
    // Não encontrou usuário local -> bloqueia o SSO; a pessoa usa o login normal.
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
