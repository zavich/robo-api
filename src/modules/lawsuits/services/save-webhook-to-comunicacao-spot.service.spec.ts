import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Root } from 'src/modules/process/interfaces/process.interface';
import { SaveWebhookToComunicacaoSpotService } from './save-webhook-to-comunicacao-spot.service';

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

const makeInstancia = (id: number, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    url: '',
    sistema: '',
    instancia: 'PRIMEIRO_GRAU',
    extra_instancia: '',
    tipo_precatorio: null,
    segredo: false,
    numero: null,
    numeros_alternativos: [],
    assunto: '',
    classe: '',
    area: '',
    data_distribuicao: '',
    orgao_julgador: '',
    pessoa_relator: '',
    moeda_valor_causa: '',
    valor_causa: '',
    arquivado: false,
    data_arquivamento: '',
    fisico: null,
    last_update_time: '',
    situacoes: [],
    dados: [],
    partes: [],
    movimentacoes: [],
    audiencias: [],
    documentos_restritos: [],
    documentos: [],
    ...overrides,
  }) as any;

function bodyToStream(body: unknown) {
  return { transformToString: async () => JSON.stringify(body) };
}

describe('SaveWebhookToComunicacaoSpotService', () => {
  let service: SaveWebhookToComunicacaoSpotService;
  let s3Send: jest.SpyInstance;

  beforeEach(() => {
    s3Send = jest.spyOn(S3Client.prototype, 'send');
    const get = (key: string) =>
      key === 'COMUNICACAO_SPOT_LOCATION'
        ? 's3://main-prd-lawsuit-frame/comunicacao-spot'
        : undefined;
    const configService = {
      get,
      getOrThrow: get,
    } as unknown as ConfigService;

    service = new SaveWebhookToComunicacaoSpotService(configService);
  });

  afterEach(() => {
    s3Send.mockRestore();
  });

  it('não sobrescreve quando o status é NAO_ENCONTRADO e já existe dado real (instâncias) anterior', async () => {
    const existente = makeBody({
      status: 'SUCESSO',
      resposta: { instancias: [makeInstancia(1)] } as any,
    });

    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: bodyToStream(existente) };
      }
      throw new Error('não devia chamar PutObjectCommand aqui');
    });

    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    expect(
      s3Send.mock.calls.some(([command]) => command instanceof PutObjectCommand),
    ).toBe(false);
  });

  it('não sobrescreve quando o status é ERRO com motivo_erro e já existe dado real anterior', async () => {
    const existente = makeBody({
      status: 'SUCESSO',
      resposta: { instancias: [makeInstancia(1)] } as any,
    });

    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: bodyToStream(existente) };
      }
      throw new Error('não devia chamar PutObjectCommand aqui');
    });

    await service.execute(
      makeBody({ status: 'ERRO', motivo_erro: 'SEM_DADOS_ORGAO_ZERO' }),
    );

    expect(
      s3Send.mock.calls.some(([command]) => command instanceof PutObjectCommand),
    ).toBe(false);
  });

  it('atualiza o status pra NAO_ENCONTRADO quando só existe o marcador BUSCANDO (sem dado real) anterior', async () => {
    const placeholder = makeBody({
      status: 'BUSCANDO',
      resposta: { instancias: [] } as any,
    });

    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: bodyToStream(placeholder) };
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as Root;

    expect(savedBody.status).toBe('NAO_ENCONTRADO');
  });

  it('grava normalmente quando o status é NAO_ENCONTRADO e não existe nenhum arquivo prévio', async () => {
    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        throw new NoSuchKey({ message: 'not found', $metadata: {} });
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as Root;

    expect(savedBody.status).toBe('NAO_ENCONTRADO');
  });

  it('cria o JSON quando não existe nenhum arquivo prévio', async () => {
    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        throw new NoSuchKey({ message: 'not found', $metadata: {} });
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(
      makeBody({ resposta: { instancias: [makeInstancia(1)] } as any }),
    );

    const putCall = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    );
    expect(putCall).toBeDefined();

    const putCommand = putCall![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as Root;
    expect(savedBody.resposta.instancias).toHaveLength(1);
    expect(savedBody.resposta.instancias[0].id).toBe(1);
    expect(putCommand.input.Key).toBe(
      'comunicacao-spot/TRT2/2023/10005801020235020492.json',
    );
  });

  it('mescla com o JSON existente, preservando instâncias antigas ausentes no novo webhook', async () => {
    const existente = makeBody({
      resposta: {
        instancias: [makeInstancia(1, { classe: 'ANTIGA' })],
      } as any,
    });

    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: bodyToStream(existente) };
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(
      makeBody({ resposta: { instancias: [makeInstancia(2)] } as any }),
    );

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as Root;

    const ids = savedBody.resposta.instancias.map((i) => i.id).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('a instância nova sobrescreve a antiga quando têm o mesmo id', async () => {
    const existente = makeBody({
      resposta: {
        instancias: [makeInstancia(1, { classe: 'ANTIGA' })],
      } as any,
    });

    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: bodyToStream(existente) };
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(
      makeBody({
        resposta: {
          instancias: [makeInstancia(1, { classe: 'ATUALIZADA' })],
        } as any,
      }),
    );

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as Root;

    expect(savedBody.resposta.instancias).toHaveLength(1);
    expect(savedBody.resposta.instancias[0].classe).toBe('ATUALIZADA');
  });

  it('normaliza a instância/movimentação pro formato completo (padrão do comunicacao-spot), preenchendo os campos que o webhook não manda', async () => {
    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        throw new NoSuchKey({ message: 'not found', $metadata: {} });
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    // Formato real do webhook (normalizeResponse.ts do scraper): a
    // instância não manda url/extra_instancia/tipo_precatorio/
    // numeros_alternativos/dados/audiencias, e a movimentação sem
    // documento não manda pje_doc_id nem texto.
    const instanciaMinima = {
      id: 1,
      assunto: [{ id: 1, codigo: '1', descricao: 'Teste', principal: true }],
      sistema: 'PJE',
      instancia: 'SEGUNDO_GRAU',
      segredo: false,
      numero: null,
      classe: 'AR',
      area: 'Trabalhista',
      data_distribuicao: '2026-01-01T00:00:00',
      orgao_julgador: 'Gabinete X',
      pessoa_relator: 'Relator X',
      moeda_valor_causa: 'R$',
      valor_causa: 100,
      arquivado: false,
      data_arquivamento: null,
      fisico: null,
      last_update_time: '2026-01-01 00:00:00',
      situacoes: [],
      partes: [],
      movimentacoes: [
        { id: 1, data: '01/01/2026', conteudo: 'Despacho' },
        {
          id: 2,
          data: '02/01/2026',
          conteudo: 'Despacho | Despacho',
          pje_doc_id: 12345,
          publico: false,
          uniqueNameDocumento: 'abc123',
          texto: 'conteúdo do documento',
        },
      ],
    };

    await service.execute(
      makeBody({ resposta: { instancias: [instanciaMinima] } as any }),
    );

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as any;
    const instancia = savedBody.resposta.instancias[0];

    expect(instancia.url).toBeNull();
    expect(instancia.extra_instancia).toBe('');
    expect(instancia.tipo_precatorio).toBeNull();
    expect(instancia.numeros_alternativos).toEqual([]);
    expect(instancia.dados).toEqual([]);
    expect(instancia.audiencias).toEqual([]);
    expect(instancia.documentos_restritos).toEqual([]);
    expect(instancia.documentos).toEqual([]);

    const movimentacaoSemDocumento = instancia.movimentacoes[0];
    expect(movimentacaoSemDocumento).toHaveProperty('pje_doc_id', null);
    expect(movimentacaoSemDocumento).toHaveProperty('texto', null);
    expect(movimentacaoSemDocumento).not.toHaveProperty('publico');

    const movimentacaoComDocumento = instancia.movimentacoes[1];
    expect(movimentacaoComDocumento.pje_doc_id).toBe(12345);
    expect(movimentacaoComDocumento.publico).toBe(false);
  });

  it('normaliza opcoes.autos (formato de documentos restritos) pro padrão {documento: boolean}', async () => {
    s3Send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        throw new NoSuchKey({ message: 'not found', $metadata: {} });
      }
      if (command instanceof PutObjectCommand) {
        return {};
      }
      throw new Error('comando inesperado');
    });

    await service.execute(makeBody({ opcoes: { autos: true } as any }));

    const putCommand = s3Send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0] as PutObjectCommand;
    const savedBody = JSON.parse(putCommand.input.Body as string) as any;

    expect(savedBody.opcoes).toEqual({ documento: true });
  });
});
