import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { SaveWebhookToAthenaService } from './save-webhook-to-athena.service';
import { ParquetWriterService } from './parquet-writer.service';
import { Root } from 'src/modules/process/interfaces/process.interface';

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

describe('SaveWebhookToAthenaService', () => {
  let parquetWriter: { writeRows: jest.Mock };
  let service: SaveWebhookToAthenaService;
  let s3Send: jest.SpyInstance;

  beforeEach(() => {
    // Evita qualquer chamada de rede real pro S3 nos testes que chegam até a
    // fase de upload (ex: quando ERRO tem motivo_erro nulo e grava normalmente).
    s3Send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);

    parquetWriter = { writeRows: jest.fn().mockResolvedValue(Buffer.from('')) };
    const get = (key: string) =>
      key === 'LAWSUIT_DATA_LOCATION'
        ? 's3://main-prd-lawsuit-frame/pje-enriquecimento/v1'
        : undefined;
    const configService = {
      get,
      getOrThrow: get,
    } as unknown as ConfigService;

    service = new SaveWebhookToAthenaService(
      configService,
      parquetWriter as unknown as ParquetWriterService,
    );
  });

  afterEach(() => {
    s3Send.mockRestore();
  });

  it('não grava nada no Parquet quando o status é NAO_ENCONTRADO', async () => {
    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    expect(parquetWriter.writeRows).not.toHaveBeenCalled();
  });

  it('não grava nada quando o status é ERRO com motivo_erro preenchido', async () => {
    await service.execute(
      makeBody({ status: 'ERRO', motivo_erro: 'SEM_DADOS_ORGAO_ZERO' }),
    );

    expect(parquetWriter.writeRows).not.toHaveBeenCalled();
  });

  it('grava normalmente quando o status é ERRO mas motivo_erro é null', async () => {
    await service.execute(
      makeBody({
        status: 'ERRO',
        motivo_erro: null,
        resposta: {
          instancias: [],
          message: '',
          numero_unico: '',
          origem: 'TRT2',
        },
      }),
    );

    expect(parquetWriter.writeRows).toHaveBeenCalled();
  });

  it('não grava nada quando o número do processo é inválido', async () => {
    await service.execute(
      makeBody({ status: 'SUCESSO', numero_processo: 'invalido' }),
    );

    expect(parquetWriter.writeRows).not.toHaveBeenCalled();
  });

  it('faz o parse correto de data_mov em DD/MM/YYYY e grava o texto da movimentação', async () => {
    await service.execute(
      makeBody({
        status: 'SUCESSO',
        resposta: {
          instancias: [
            {
              id: 1,
              url: '',
              sistema: '',
              instancia: '1',
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
              movimentacoes: [
                {
                  id: 999,
                  // Dia 31 quebrava com `new Date(...)` direto (interpretado
                  // como MM/DD/YYYY) antes do parser dedicado pt-BR.
                  data: '31/12/2026',
                  conteudo: 'Sentença',
                  pje_doc_id: 187030984,
                  uniqueNameDocumento: 'doc-abc',
                  texto: 'Conteúdo integral do documento',
                },
              ],
              audiencias: [],
              documentos_restritos: [],
              documentos: [],
            },
          ],
          message: '',
          numero_unico: '',
          origem: 'TRT2',
        },
      }),
    );

    const movimentacoesCall = parquetWriter.writeRows.mock.calls.find(
      ([, rows]) => rows[0]?.movimentacao_id !== undefined,
    );
    expect(movimentacoesCall).toBeDefined();

    const [, rows] = movimentacoesCall!;
    expect(rows[0].texto).toBe('Conteúdo integral do documento');
    expect(rows[0].unique_name_documento).toBe('doc-abc');
    expect(rows[0].pje_doc_id).toBe(187030984);
    expect(rows[0].data_mov).toBeInstanceOf(Date);
    expect((rows[0].data_mov as Date).toISOString().slice(0, 10)).toBe(
      '2026-12-31',
    );
  });

  it('extrai o assunto principal quando `assunto` vem como array (formato real do payload)', async () => {
    await service.execute(
      makeBody({
        status: 'SUCESSO',
        resposta: {
          instancias: [
            {
              id: 1,
              url: '',
              sistema: '',
              instancia: '1',
              extra_instancia: '',
              tipo_precatorio: null,
              segredo: false,
              numero: null,
              numeros_alternativos: [],
              // A interface diz `string`, mas o scraper manda um array de
              // {codigo, descricao, principal} — isso já quebrou a escrita
              // inteira de pje_instancias antes (UTF8 recebendo um objeto).
              assunto: [
                { id: 111, codigo: '999', descricao: 'Assunto Secundário' },
                {
                  id: 222,
                  codigo: '13931',
                  descricao: 'Reajuste Salarial',
                  principal: true,
                },
              ] as unknown as string,
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
            },
          ],
          message: '',
          numero_unico: '',
          origem: 'TRT2',
        },
      }),
    );

    const instanciasCall = parquetWriter.writeRows.mock.calls.find(
      ([, rows]) => rows[0]?.instancia_id !== undefined,
    );
    expect(instanciasCall).toBeDefined();

    const [, rows] = instanciasCall!;
    expect(rows[0].assunto_principal).toBe('Reajuste Salarial');
    expect(rows[0].assunto_principal_codigo).toBe(13931);
    expect(rows[0].assuntos_json).toBe(
      JSON.stringify([
        { id: 111, codigo: '999', descricao: 'Assunto Secundário' },
        {
          id: 222,
          codigo: '13931',
          descricao: 'Reajuste Salarial',
          principal: true,
        },
      ]),
    );
  });
});
