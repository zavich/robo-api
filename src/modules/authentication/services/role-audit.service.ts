import { InjectModel } from '@nestjs/mongoose';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/modules/user/schema/user.schema';
import { isKnownRole } from '../constants/permissions.constant';

@Injectable()
export class RoleAuditService implements OnModuleInit {
  private readonly logger = new Logger(RoleAuditService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }

    const roles = await this.userModel.distinct('role');
    const normalizedRoles = roles.filter(
      (role) => typeof role === 'string' && role.length > 0,
    ) as string[];
    const unknownRoles = normalizedRoles.filter((role) => !isKnownRole(role));

    if (unknownRoles.length === 0) {
      return;
    }

    const message =
      'Roles nao mapeadas encontradas na base: ' + unknownRoles.join(', ');

    if (this.configService.get<string>('AUTH_STRICT_ROLE_AUDIT') === 'true') {
      throw new Error(message);
    }

    this.logger.warn(message);
  }
}
