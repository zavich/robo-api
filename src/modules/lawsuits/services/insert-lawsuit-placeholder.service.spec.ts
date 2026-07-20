import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { InsertLawsuitPlaceholderService } from './insert-lawsuit-placeholder.service';
import { FetchComunicacaoSpotService } from './fetch-comunicacao-spot.service';

describe('InsertLawsuitPlaceholderService', () => {
  let service: InsertLawsuitPlaceholderService;
  let s3Send: jest.SpyInstance;

  beforeEach(() => {
    s3Send = jest.spyOn(S3Client.prototype, 'send');
    s3Send.mockReset();

    const get = (key: string) => {
      const values: Record<string, string> = {
        ATHENA_ACCESS_KEY_ID: 'key',
        ATHENA_SECRET_ACCESS_KEY: 'secret',
        ATHENA_REGION: 'sa-east-1',
        COMUNICACAO_SPOT_LOCATION:
          's3://main-prd-lawsuit-frame/comunicacao-spot',
      };
      return values[key];
    };
    const configService = {
      get,
      getOrThrow: get,
    } as unknown as ConfigService;

    const fetchComunicacaoSpotService = new FetchComunicacaoSpotService(
      configService,
    );

    service = new InsertLawsuitPlaceholderService(
      configService,
      fetchComunicacaoSpotService,
    );
  });

  it('rejeita número de processo inválido', async () => {
    await expect(service.execute('invalido')).rejects.toThrow(
      BadRequestException,
    );
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('quando já existe qualquer registro em comunicacao-spot (real ou só BUSCANDO), não sobrescreve nem interpreta o conteúdo', async () => {
    // Comunicacao-spot não é mais fonte de consulta — não importa se o que
    // já existe é dado real (de outro coletor) ou só o placeholder de uma
    // chamada anterior: em ambos os casos só não sobrescreve, sem cache no
    // Redis e sem tentar decidir "achou"/"cached" nenhum.
    const existingBody = {
      numero_processo: '1000580-10.2023.5.02.0492',
      status: 'SUCESSO',
      resposta: {
        instancias: [{ id: 1, instancia: 'PRIMEIRO_GRAU' }],
        origem: 'TRT2',
      },
    };
    s3Send.mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(existingBody) },
    });

    const result = await service.execute('1000580-10.2023.5.02.0492');

    expect(result).toEqual({
      message: 'Processo já possuía registro em comunicacao-spot',
      alreadyExists: true,
    });
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(s3Send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it('grava o marcador BUSCANDO quando não existe nada em comunicacao-spot', async () => {
    s3Send.mockRejectedValueOnce(
      new NoSuchKey({ message: 'not found', $metadata: {} }),
    );
    s3Send.mockResolvedValueOnce({});

    const result = await service.execute('1000580-10.2023.5.02.0492');

    expect(result).toEqual({
      message: 'Processo inserido em comunicacao-spot',
      alreadyExists: false,
    });

    expect(s3Send).toHaveBeenCalledTimes(2);
    const putCall = s3Send.mock.calls[1][0];
    expect(putCall).toBeInstanceOf(PutObjectCommand);

    const body = JSON.parse(putCall.input.Body as string);
    expect(body).toMatchObject({
      numero_processo: '1000580-10.2023.5.02.0492',
      status: 'BUSCANDO',
      opcoes: { documento: false },
      resposta: { instancias: [] },
    });
  });
});
