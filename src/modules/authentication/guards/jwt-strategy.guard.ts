import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';

export type iJwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    configService: ConfigService,
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
    const user = await this.userModel.findOne({
      _id: payload.sub,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
