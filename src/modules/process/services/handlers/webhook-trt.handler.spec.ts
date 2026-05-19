import { WebhookTrtHandler } from './webhook-trt.handler';

describe('WebhookTrtHandler.isProvisionalExecution', () => {
  let handler: WebhookTrtHandler;

  beforeEach(() => {
    // Instantiate with null deps since isProvisionalExecution has no DI deps
    handler = new WebhookTrtHandler(null as any, null as any, null as any);
  });

  it('returns false when classProcess is undefined', () => {
    expect(handler.isProvisionalExecution(undefined)).toBe(false);
  });

  it('returns false when classProcess is empty string', () => {
    expect(handler.isProvisionalExecution('')).toBe(false);
  });

  it('returns true for "Execucao Provisoria"', () => {
    expect(handler.isProvisionalExecution('Execucao Provisoria')).toBe(true);
  });

  it('returns true regardless of accent normalization', () => {
    expect(handler.isProvisionalExecution('Execução Provisória')).toBe(true);
  });

  it('returns true for case-insensitive match', () => {
    expect(handler.isProvisionalExecution('EXECUCAO PROVISORIA')).toBe(true);
  });

  it('returns false for unrelated class', () => {
    expect(handler.isProvisionalExecution('Reclamacao Trabalhista')).toBe(false);
  });
});
