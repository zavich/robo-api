import { Root } from 'src/modules/process/interfaces/process.interface';
import {
  CacheProcessoToRedisService,
  redisKeyForProcesso,
} from './cache-processo-to-redis.service';

const makeBody = (overrides: Partial<Root> = {}): Root =>
  ({
    numero_processo: '1000580-10.2023.5.02.0492',
    status: 'SUCESSO',
    tribunal: { sigla: 'TRT2' } as any,
    webhookId: 'wh-1',
    resposta: {
      instancias: [],
      message: '',
      numero_unico: '',
      origem: 'TRT2',
    },
    created_at: { date: '', timezone: '', timezone_type: 3 },
    enviar_callback: '',
    link_api: '',
    motivo_erro: null,
    status_callback: null,
    tipo: '',
    opcoes: {},
    valor: '',
    event: '',
    id: 1,
    uuid: '',
    ...overrides,
  }) as Root;

describe('CacheProcessoToRedisService', () => {
  let redis: { set: jest.Mock };
  let service: CacheProcessoToRedisService;

  beforeEach(() => {
    redis = { set: jest.fn().mockResolvedValue('OK') };
    service = new CacheProcessoToRedisService(redis as any);
  });

  it('não grava no Redis quando o status é NAO_ENCONTRADO', async () => {
    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('não grava no Redis quando o status é ERRO com motivo_erro preenchido', async () => {
    await service.execute(
      makeBody({ status: 'ERRO', motivo_erro: 'SEM_DADOS_ORGAO_ZERO' }),
    );

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('grava no Redis com a mesma forma de resposta do FindProcessoService', async () => {
    const body = makeBody({
      resposta: {
        instancias: [
          {
            id: 10,
            instancia: 'PRIMEIRO_GRAU',
            classe: 'ATOrd',
            area: 'Trabalhista',
            valor_causa: 14914.27,
            arquivado: true,
            segredo: false,
            assunto: [
              { id: 1, codigo: '100', descricao: 'Horas Extras', principal: true },
            ],
            partes: [
              {
                id: 20,
                tipo: 'RECLAMANTE',
                nome: 'Fulano',
                principal: true,
                polo: 'ATIVO',
                documento: { tipo: 'CPF', numero: '123' },
                advogado_de: 99,
              },
            ],
            movimentacoes: [
              {
                id: 30,
                data: '31/12/2026',
                conteudo: 'Sentença',
                pje_doc_id: 555,
              },
            ],
          } as any,
        ],
        origem: 'TRT2',
      } as any,
    });

    await service.execute(body);

    expect(redis.set).toHaveBeenCalledWith(
      redisKeyForProcesso('1000580-10.2023.5.02.0492'),
      expect.any(String),
      'EX',
      60 * 60 * 24 * 30,
    );

    const [, payload] = redis.set.mock.calls[0];
    const saved = JSON.parse(payload);

    // Tudo que o Athena devolve em resultado de query já vem como string —
    // números/booleanos nativos do webhook precisam ser convertidos, senão
    // comparação estrita no front (ex: `principal === "true"`) quebra em
    // silêncio pra quem lê do cache no Redis em vez do Athena.
    expect(saved.cnjNumber).toBe('1000580-10.2023.5.02.0492');
    expect(saved.trt).toBe('TRT2');
    expect(saved.anoProcesso).toBe('2023');
    expect(typeof saved.numInstancias).toBe('string');
    expect(typeof saved.enriquecidoEm).toBe('string');
    expect(saved.enriquecidoEm).not.toContain('T');
    expect(saved.enriquecidoEm).not.toContain('Z');

    expect(saved.partes).toHaveLength(1);
    expect(saved.partes[0].nome).toBe('Fulano');
    expect(saved.partes[0].principal).toBe('true');
    expect(saved.partes[0].parteId).toBe('20');
    expect(saved.partes[0].instanciaId).toBe('10');
    expect(saved.partes[0].advogadoDe).toBe('99');

    expect(saved.instancias).toHaveLength(1);
    expect(saved.instancias[0].instanciaId).toBe('10');
    expect(saved.instancias[0].assuntoPrincipal).toBe('Horas Extras');
    expect(saved.instancias[0].valorCausa).toBe('14914.27');
    expect(saved.instancias[0].arquivado).toBe('true');
    expect(saved.instancias[0].segredo).toBe('false');

    expect(saved.movimentacoes).toHaveLength(1);
    expect(saved.movimentacoes[0].instanciaId).toBe('10');
    expect(saved.movimentacoes[0].movimentacaoId).toBe('30');
    expect(saved.movimentacoes[0].documentoId).toBe('555');
    expect(saved.movimentacoes[0].data).toBe('2026-12-31');
  });
});
