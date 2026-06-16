import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import Redis from 'ioredis';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import { JWT_ALGORITHM, SELF_ISSUER } from '../jwt/jwt.constants';
import { readIssuer } from '../jwt/jwt-keys';
import { extractAuthToken } from '../jwt/extract-token';
import {
  SSO_PUBLIC_KEYS,
  SsoPublicKeys,
} from '../jwt/sso-public-keys.provider';
import { isKnownRole, Permission } from '../constants/permissions.constant';
import { buildUserProfile } from '../services/user-profile.util';

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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @Inject(SSO_PUBLIC_KEYS) publicKeys: SsoPublicKeys,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    super({
      // aceita o token tanto via header Authorization: Bearer quanto via cookie
      // (`auth_token` da juri-api ou `robo_auth_token` da sessão própria).
      jwtFromRequest: ExtractJwt.fromExtractors([extractAuthToken]),
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

  /**
   * Autenticação PURA: resolve o principal a partir de um token já validado e
   * NUNCA muta estado. Usuário do SSO que ainda não existe localmente é criado
   * pelo endpoint explícito `POST /auth/sso/session` (provisionamento JIT), não
   * aqui — um guard não deve ter efeito colateral de escrita.
   */
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
    const ownPermissions =
      payload.iss === SELF_ISSUER ? payload.permissions : undefined;
    return buildUserProfile(user, ownPermissions);
  }
}
