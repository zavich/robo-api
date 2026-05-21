import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServiceWebhookGuard } from './service-webhook.guard';

describe('ServiceWebhookGuard', () => {
  let guard: ServiceWebhookGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ServiceWebhookGuard(reflector);
    process.env.WEBHOOK_SERVICE_KEY = 'service-secret';
    process.env.PIPEDRIVE_WEBHOOK_KEY = 'pipedrive-secret';
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SERVICE_KEY;
    delete process.env.PIPEDRIVE_WEBHOOK_KEY;
    jest.restoreAllMocks();
  });

  function makeContext(
    request: Record<string, unknown>,
    metadata?: 'service' | 'pipedrive',
  ) {
    if (metadata) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(metadata);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as any;
  }

  it('accepts the service secret for the main webhook', () => {
    const canActivate = guard.canActivate(
      makeContext({
        headers: { 'x-service-key': 'service-secret' },
        path: '/v1/process/webhook',
        query: {},
      }),
    );

    expect(canActivate).toBe(true);
  });

  it('accepts the dedicated pipedrive secret on webhook-pipedrive route', () => {
    const canActivate = guard.canActivate(
      makeContext({
        headers: { authorization: 'Bearer pipedrive-secret' },
        path: '/v1/process/webhook-pipedrive',
        query: {},
      }),
    );

    expect(canActivate).toBe(true);
  });

  it('accepts the dedicated pipedrive secret when the path has a trailing slash', () => {
    const canActivate = guard.canActivate(
      makeContext({
        headers: { authorization: 'Bearer pipedrive-secret' },
        path: '/v1/process/webhook-pipedrive/',
        query: {},
      }),
    );

    expect(canActivate).toBe(true);
  });

  it('uses metadata when present to pick the secret bucket', () => {
    const canActivate = guard.canActivate(
      makeContext(
        {
          headers: { authorization: 'Bearer pipedrive-secret' },
          path: '/v1/process/webhook',
          query: {},
        },
        'pipedrive',
      ),
    );

    expect(canActivate).toBe(true);
  });

  it('rejects missing secret', () => {
    expect(() =>
      guard.canActivate(
        makeContext({
          headers: {},
          path: '/v1/process/webhook',
          query: {},
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('fails closed when the server has no configured secret', () => {
    delete process.env.WEBHOOK_SERVICE_KEY;
    delete process.env.PIPEDRIVE_WEBHOOK_KEY;

    expect(() =>
      guard.canActivate(
        makeContext({
          headers: { 'x-service-key': 'service-secret' },
          path: '/v1/process/webhook',
          query: {},
        }),
      ),
    ).toThrow(ServiceUnavailableException);
  });
});
