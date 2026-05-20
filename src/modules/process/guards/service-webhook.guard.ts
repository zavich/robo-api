import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class ServiceWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedSecret = this.extractSecret(request);
    const expectedSecrets = this.getExpectedSecrets(request);

    if (expectedSecrets.length === 0) {
      throw new ServiceUnavailableException(
        'Webhook secret não configurada no servidor',
      );
    }

    if (!providedSecret) {
      throw new UnauthorizedException('Webhook secret ausente');
    }

    const isValid = expectedSecrets.some((secret) =>
      safeEquals(providedSecret, secret),
    );

    if (!isValid) {
      throw new UnauthorizedException('Webhook secret inválida');
    }

    return true;
  }

  private extractSecret(request: Request): string | null {
    const headerSecret = request.headers['x-service-key'];
    if (typeof headerSecret === 'string' && headerSecret.length > 0) {
      return headerSecret;
    }

    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }

    const querySecret = request.query.key;
    if (typeof querySecret === 'string' && querySecret.length > 0) {
      return querySecret;
    }

    return null;
  }

  private getExpectedSecrets(request: Request): string[] {
    const routePath = request.route?.path ?? request.path ?? '';
    const secrets =
      routePath.includes('webhook-pipedrive')
        ? [process.env.PIPEDRIVE_WEBHOOK_KEY, process.env.WEBHOOK_SERVICE_KEY]
        : [process.env.WEBHOOK_SERVICE_KEY];

    return secrets.filter((secret): secret is string => Boolean(secret));
  }
}
