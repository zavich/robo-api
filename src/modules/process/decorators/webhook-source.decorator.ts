import { SetMetadata } from '@nestjs/common';

export const WEBHOOK_SOURCE_KEY = 'webhookSource';

export type WebhookSource = 'service' | 'pipedrive';

export const WebhookSourceMetadata = (source: WebhookSource) =>
  SetMetadata(WEBHOOK_SOURCE_KEY, source);
