import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { User } from 'src/modules/user/schema/user.schema';
import { AuthDto } from '../dto/auth.dto';
import { getPermissionsForRole } from '../constants/permissions.constant';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30 * 60;

@Injectable()
export class LoginService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async execute(data: AuthDto) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const lockKey = `login:lock:${normalizedEmail}`;
    const attemptsKey = `login:failed:${normalizedEmail}`;

    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      throw new HttpException(
        `Tentativas excessivas. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      await this.recordFailedAttempt(attemptsKey, lockKey);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Autenticação exige email + senha; bcrypt.compare valida a senha hasheada.
    const passwordValid = await bcrypt.compare(data.password, user.password);
    if (!passwordValid) {
      await this.recordFailedAttempt(attemptsKey, lockKey);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Conta desativada');
    }

    await this.redis.del(attemptsKey);

    const jti = randomUUID();
    const permissions = getPermissionsForRole(user.role);
    const accessToken = this.jwtService.sign({
      identifier: normalizedEmail,
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
