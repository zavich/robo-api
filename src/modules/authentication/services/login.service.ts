import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { User } from 'src/modules/user/schema/user.schema';
import { AuthDto } from '../dto/auth.dto';
import { getPermissionsForRole, isKnownRole } from '../constants/permissions.constant';

const MAX_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 15 * 60;

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async execute(data: AuthDto) {
    const lockKey = `login:lock:${data.email}`;
    const attemptsKey = `login:failed:${data.email}`;

    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      throw new HttpException(
        `Tentativas excessivas. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.userModel.findOne({ email: data.email });

    if (!user) {
      await this.recordFailedAttempt(attemptsKey, lockKey);
      throw new UnauthorizedException('E-mail não autorizado');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Conta desativada');
    }

    await this.redis.del(attemptsKey);

    if (!isKnownRole(user.role)) {
      this.logger.warn(
        `Login de usuario com role nao mapeada: ${user.email} (${user.role})`,
      );
    }

    const jti = randomUUID();
    const permissions = getPermissionsForRole(user.role);
    const accessToken = this.jwtService.sign({
      identifier: data.email,
      sub: user._id,
      jti,
      permissions,
    });

    return {
      accessToken,
      jti,
      user: {
        email: user.email,
        _id: user._id,
      },
    };
  }

  private async recordFailedAttempt(attemptsKey: string, lockKey: string): Promise<void> {
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, LOCKOUT_SECONDS);
    }
    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.set(lockKey, '1', 'EX', LOCKOUT_SECONDS);
      await this.redis.del(attemptsKey);
    }
  }
}
