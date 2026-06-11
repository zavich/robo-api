import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import Redis from 'ioredis';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import {
  AUTH_COOKIE_NAME,
  JURI_ISSUER,
  JWT_ALGORITHM,
  SELF_ISSUER,
} from '../jwt/jwt.constants';
import { buildPublicKeyMap, readIssuer } from '../jwt/jwt-keys';
import {
  getPermissionsForRole,
  isKnownRole,
  Permission,
} from '../constants/permissions.constant';

/**
 * Payload combinado SSO + refactor.
 *  - `user.email`: identidade do contrato de SSO (a juri-api emite a mesma
 *    forma), resolvida por e-mail independente de quem assinou.
 *  - `jti`/`permissions`: revogação e autorização introduzidas no refactor.
 *  - `iss`: emissor do token; só confiamos em `permissions` quando for o próprio.
 */
export type iJwtPayload = {
  sub: string;
  iss?: string;
  identifier?: string;
  jti?: string;
  permissions?: Permission[];
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
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    const publicKeys = buildPublicKeyMap({
      publicKeyPainelRobo: configService.get<string>(
        'JWT_PUBLIC_KEY_ROBO_API',
      ),
      publicKeyApi: configService.get<string>('JWT_PUBLIC_KEY_JURI_API'),
    });

    // Falha cedo: sem a chave do issuer no mapa, qualquer token daquele emissor
    // é rejeitado com 401 silencioso (inclusive os próprios, emitidos por esta
    // API). As duas chaves são obrigatórias: a própria (JWT_PUBLIC_KEY_ROBO_API)
    // valida a sessão local do painel-robo, e a da juri-api
    // (JWT_PUBLIC_KEY_JURI_API) valida o SSO juri-api -> painel-robo.
    // Em testes (NODE_ENV=test) não abortamos: o AppModule sempre importa o
    // AuthenticationModule e a suíte não exercita validação de tokens; tokens
    // ainda são rejeitados em runtime se a chave do issuer não estiver no mapa.
    const missing: string[] = [];
    if (!publicKeys[SELF_ISSUER]) missing.push('JWT_PUBLIC_KEY_ROBO_API');
    if (!publicKeys[JURI_ISSUER]) missing.push('JWT_PUBLIC_KEY_JURI_API');
    if (missing.length && process.env.NODE_ENV !== 'test') {
      throw new Error(
        `Chave(s) pública(s) de SSO ausente(s): ${missing.join(', ')}. ` +
          'Sem elas a validação de tokens RS256 retorna 401. Configure a(s) env(s).',
      );
    }

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
    // Revogação por jti (refactor): token cujo jti está na blocklist do Redis
    // (ex.: após logout) é recusado mesmo dentro da validade.
    if (payload.jti) {
      const isRevoked = await this.redis.exists(`jwt:revoked:${payload.jti}`);
      if (isRevoked) {
        throw new UnauthorizedException('Token revogado');
      }
    }

    // Identidade resolvida por e-mail (contrato do SSO): funciona tanto para
    // tokens próprios quanto para tokens da juri-api, cujo `sub` é o _id do
    // outro serviço e não casaria com a base local.
    const email = payload?.user?.email?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException();
    }

    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    if (!isKnownRole(user.role)) {
      this.logger.warn(
        `Token validado para usuario com role nao mapeada: ${user.email} (${user.role})`,
      );
    }

    // Autorização sempre a partir do papel LOCAL. Só confiamos na lista de
    // permissões do payload quando o token foi emitido por esta própria API;
    // de um token de outro serviço (juri-api) derivamos do role local.
    const permissions =
      payload.iss === SELF_ISSUER && payload.permissions
        ? payload.permissions
        : getPermissionsForRole(user.role);
    const { password: _pw, ...userObj } = user.toObject();
    return { ...userObj, id: String(userObj._id), permissions };
  }
}
