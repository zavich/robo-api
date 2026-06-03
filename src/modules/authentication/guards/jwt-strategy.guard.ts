import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import Redis from 'ioredis';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import {
  getPermissionsForRole,
  isKnownRole,
  Permission,
} from '../constants/permissions.constant';

export type iJwtPayload = {
  sub: string;
  email: string;
  jti?: string;
  permissions?: Permission[];
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
    const cookieExtractor = (req: Request): string | null => {
      if (req && req.cookies) {
        return req.cookies['prosolutti_accessToken'] || null;
      }
      return null;
    };

    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET_KEY'),
    });
  }

  async validate(payload: iJwtPayload) {
    if (payload.jti) {
      const isRevoked = await this.redis.exists(`jwt:revoked:${payload.jti}`);
      if (isRevoked) {
        throw new UnauthorizedException('Token revogado');
      }
    }

    const user = await this.userModel.findOne({
      _id: payload.sub,
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    if (!isKnownRole(user.role)) {
      this.logger.warn(
        `Token validado para usuario com role nao mapeada: ${user.email} (${user.role})`,
      );
    }

    const permissions = payload.permissions ?? getPermissionsForRole(user.role);
    const { password: _pw, ...userObj } = user.toObject();
    return { ...userObj, id: String(userObj._id), permissions };
  }
}
