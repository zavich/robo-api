import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_ALGORITHM } from '../jwt/jwt.constants';
import { readIssuer } from '../jwt/jwt-keys';
import {
  SSO_PUBLIC_KEYS,
  SsoPublicKeys,
} from '../jwt/sso-public-keys.provider';
import type { iJwtPayload } from '../guards/jwt-strategy.guard';

/**
 * Verifica a assinatura RS256 de um token de SSO escolhendo a chave pública pelo
 * `iss` (mesma regra do `JwtStrategy`, sem efeito colateral). Usado pelo endpoint
 * de bootstrap (`POST /auth/sso/session`), que precisa validar o token ANTES de
 * existir um usuário local — por isso não pode passar pelo guard padrão, que
 * exige usuário já provisionado.
 */
@Injectable()
export class SsoTokenVerifierService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(SSO_PUBLIC_KEYS) private readonly publicKeys: SsoPublicKeys,
  ) {}

  verify(token: string): iJwtPayload {
    const iss = readIssuer(token);
    const key = iss ? this.publicKeys[iss] : undefined;
    if (!key) {
      throw new UnauthorizedException('JWT issuer não reconhecido');
    }

    try {
      return this.jwtService.verify<iJwtPayload>(token, {
        publicKey: key,
        algorithms: [JWT_ALGORITHM],
        issuer: iss,
      });
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
