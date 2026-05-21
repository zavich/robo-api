import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { compare } from 'bcryptjs';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { User } from 'src/modules/user/schema/user.schema';
import { AuthDto } from '../dto/auth.dto';
import { getPermissionsForRole, isKnownRole } from '../constants/permissions.constant';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutos

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

    // Verificar se a conta está bloqueada
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      throw new HttpException(
        `Conta temporariamente bloqueada. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const user = await this.userModel.findOne({ email: data.email });

      if (!user) {
        await this.recordFailedAttempt(attemptsKey, lockKey);
        throw new BadRequestException('E-mail ou senha inválidos');
      }

      const passwordMatch = await compare(data.password, user?.password || '');
      if (!passwordMatch) {
        await this.recordFailedAttempt(attemptsKey, lockKey);
        throw new BadRequestException('E-mail ou senha inválidos');
      }

      // Login bem-sucedido: limpar contador de tentativas
      await this.redis.del(attemptsKey);

      const jti = randomUUID();
      if (!isKnownRole(user.role)) {
        this.logger.warn(
          `Login de usuario com role nao mapeada: ${user.email} (${user.role})`,
        );
      }
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
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }

  private async recordFailedAttempt(attemptsKey: string, lockKey: string): Promise<void> {
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      // Primeiro erro: definir TTL da janela de contagem
      await this.redis.expire(attemptsKey, LOCKOUT_SECONDS);
    }
    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.set(lockKey, '1', 'EX', LOCKOUT_SECONDS);
      await this.redis.del(attemptsKey);
    }
  }
}
