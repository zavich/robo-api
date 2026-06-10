import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WebhookTrtHandler } from './webhook-trt.handler';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { ExtractDocumentsInfoService } from '../../queues/process/services/extract-documents-info.service';
import { StatusExtractionInsight } from '../../enums/status-extraction-insight.enum';

const mockProcessModel = () => ({
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
});

const mockNextStepsService = () => ({
  execute: jest.fn(),
});

const mockExtractDocumentsService = () => ({
  execute: jest.fn(),
});

const makeBody = (autos = false) =>
  ({
    numero_processo: '0000001-00.2024.5.03.0001',
    status: 'SUCESSO',
    opcoes: autos ? { autos: true } : {},
    tribunal: { sigla: 'TRT3' },
    resposta: {
      origem: 'TRT3',
      numero_unico: '0000001-00.2024.5.03.0001',
      instancias: [
        {
          instancia: 'PRIMEIRO_GRAU',
          classe: 'Execução Provisória',
          valor_causa: 1000,
          partes: [{ nome: 'Autor', tipo: 'reclamante' }],
          movimentacoes: [{ conteudo: 'Mov 1' }, { conteudo: 'Mov 2' }],
          documentos: autos
            ? [
                { _id: 'doc-1', title: 'Petição Inicial' },
                { _id: 'doc-2', title: 'Planilha' },
              ]
            : [],
        },
      ],
    },
  }) as any;

describe('WebhookTrtHandler', () => {
  let handler: WebhookTrtHandler;
  let processModel: ReturnType<typeof mockProcessModel>;
  let nextStepsService: ReturnType<typeof mockNextStepsService>;
  let extractDocumentsService: ReturnType<typeof mockExtractDocumentsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WebhookTrtHandler,
        { provide: getModelToken(ProcessEntity.name), useFactory: mockProcessModel },
        { provide: NextStepsService, useFactory: mockNextStepsService },
        {
          provide: ExtractDocumentsInfoService,
          useFactory: mockExtractDocumentsService,
        },
      ],
    }).compile();

    handler = module.get(WebhookTrtHandler);
    processModel = module.get(getModelToken(ProcessEntity.name));
    nextStepsService = module.get(NextStepsService);
    extractDocumentsService = module.get(ExtractDocumentsInfoService);
  });

  describe('handle', () => {
    it('persists moviments and advances the pipeline when webhook arrives without autos', async () => {
      const body = makeBody(false);
      const process = {
        _id: 'proc-id',
        number: body.numero_processo,
        instancias: [],
        processStatus: { _id: 'status-id' },
      } as any;
      const step = { slug: 'step-2' } as any;

      await handler.handle(body, process, step, 'corr-123');

      expect(processModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'proc-id',
        expect.objectContaining({
          instancias: body.resposta.instancias,
          origem: body.resposta.origem,
          class: 'PROVISIONAL_EXECUTION',
          processParts: body.resposta.instancias[0].partes,
        }),
      );
      expect(nextStepsService.execute).toHaveBeenCalledWith('step-2', {
        processNumber: body.numero_processo,
        correlationId: 'corr-123',
      });
    });

    it('marks docs as pending and forwards the webhook payload when autos are present', async () => {
      const body = makeBody(true);
      const process = {
        _id: 'proc-id',
        number: body.numero_processo,
        class: 'MAIN',
        calledByProvisionalLawsuitNumber: '0000002-00.2024.5.03.0001',
        processStatus: { _id: 'status-id' },
      } as any;
      const step = { slug: 'step-3' } as any;

      processModel.findOne.mockResolvedValueOnce(null);

      await handler.handle(body, process, step, 'corr-456');

      expect(processModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'proc-id',
        expect.objectContaining({
          documents: [
            expect.objectContaining({
              _id: 'doc-1',
              status: StatusExtractionInsight.PENDING,
            }),
            expect.objectContaining({
              _id: 'doc-2',
              status: StatusExtractionInsight.PENDING,
            }),
          ],
          instanciasAutosWithDocs: body.resposta.instancias,
          class: 'PROVISIONAL_EXECUTION',
        }),
      );
      expect(extractDocumentsService.execute).not.toHaveBeenCalled();
      expect(nextStepsService.execute).toHaveBeenCalledWith('step-3', {
        ...body,
        correlationId: 'corr-456',
      });
    });
  });

  describe('isProvisionalExecution', () => {
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
});
