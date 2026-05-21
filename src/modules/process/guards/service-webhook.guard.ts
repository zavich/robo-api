import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import {
  WEBHOOK_SOURCE_KEY,
  WebhookSource,
} from '../decorators/webhook-source.decorator';

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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const source = this.resolveSource(context, request);
    const providedSecret = this.extractSecret(request);
    const expectedSecrets = this.getExpectedSecrets(source);

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

  private resolveSource(
    context: ExecutionContext,
    request: Request,
  ): WebhookSource {
    const annotated = this.reflector.getAllAndOverride<WebhookSource>(
      WEBHOOK_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (annotated) {
      return annotated;
    }

    const routePath = this.normalizePath(
      request.path ?? request.originalUrl ?? '',
    );
    return routePath.endsWith('/webhook-pipedrive') ? 'pipedrive' : 'service';
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

  private getExpectedSecrets(source: WebhookSource): string[] {
    const secrets =
      source === 'pipedrive'
        ? [process.env.PIPEDRIVE_WEBHOOK_KEY, process.env.WEBHOOK_SERVICE_KEY]
        : [process.env.WEBHOOK_SERVICE_KEY];

    return secrets.filter((secret): secret is string => Boolean(secret));
  }

  private normalizePath(path: string): string {
    if (!path) {
      return '';
    }

    const withoutQueryString = path.split('?')[0];
    const normalized = withoutQueryString.replace(/\/+$/, '');
    return normalized || '/';
  }
}
