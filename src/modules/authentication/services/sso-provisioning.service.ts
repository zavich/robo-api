import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from '../../user/schema/user.schema';
import type { iJwtPayload } from '../guards/jwt-strategy.guard';

/**
 * Valor de `cargo` (no payload da juri-api) que concede privilégio de admin
 * nesta API. Qualquer outro cargo cai no mínimo privilégio (advogado).
 * Comparado em lowercase. Se a juri-api mudar a string, ajustar aqui.
 */
const JURI_ADMIN_CARGO = 'admin';

/**
 * Provisionamento JIT (just-in-time) de usuários do SSO.
 *
 * A robo-api usa um banco próprio, separado da juri-api: muitos usuários reais
 * da juri-api ainda não têm registro local. Em vez de criar um a um, quando um
 * token JÁ VALIDADO da juri-api (assinatura RS256 conferida) chega no `/auth/me`
 * e não há usuário local com aquele e-mail, criamos o registro on-the-fly para
 * o SSO funcionar. Só é chamado depois da validação da assinatura — nunca cria
 * usuário a partir de token não confiável.
 */
@Injectable()
export class SsoProvisioningService {
  private readonly logger = new Logger(SsoProvisioningService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Cria (ou recupera, em caso de corrida) o usuário local a partir do payload
   * do SSO. Idempotente: usa upsert com `$setOnInsert`, então duas chamadas
   * concorrentes não duplicam nem sobrescrevem um registro existente.
   */
  async provisionFromSso(payload: iJwtPayload): Promise<UserDocument> {
    const email = payload.user.email.trim().toLowerCase();
    const role = this.mapCargoToRole(payload.user.cargo);
    const name = this.buildName(payload.user, email);

    // Sessão SSO não tem senha; gera um hash de um segredo aleatório só para
    // satisfazer o schema (campo obrigatório). Login direto fica inviável até um
    // eventual fluxo de definição/reset de senha — o usuário entra via SSO.
    const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

    const user = await this.userModel.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name,
          role,
          password,
          isActive: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    this.logger.log(
      `Usuario provisionado via SSO (JIT): ${email} (role=${role})`,
    );

    return user;
  }

  /**
   * `admin` na juri-api -> admin aqui; qualquer outro cargo -> advogado
   * (mínimo privilégio). Não confiamos no payload para escalar além de admin.
   */
  private mapCargoToRole(cargo?: string): UserRole {
    return cargo?.trim().toLowerCase() === JURI_ADMIN_CARGO
      ? UserRole.ADMIN
      : UserRole.USER;
  }

  private buildName(user: iJwtPayload['user'], email: string): string {
    const fromPayload = [user.nome, user.sobreNome]
      .map((part) => part?.trim())
      .filter((part): part is string => !!part)
      .join(' ')
      .trim();

    return fromPayload || email.split('@')[0] || email;
  }
}
