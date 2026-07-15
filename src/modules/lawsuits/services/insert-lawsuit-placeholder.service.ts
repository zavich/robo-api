import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveComunicacaoSpotObject } from '../utils/comunicacao-spot-object.util';
import { buildBuscandoPlaceholder } from '../utils/buscando-placeholder.util';
import { CacheProcessoToRedisService } from './cache-processo-to-redis.service';
import { FetchComunicacaoSpotService } from './fetch-comunicacao-spot.service';

// Insere um marcador "BUSCANDO" em comunicacao-spot pra um processo que
// ainda não tem registro lá — diferente de `SearchNewLawsuitService`, NÃO
// dispara extração nenhuma (sem custo de captcha), só sinaliza pra quem lê
// esses arquivos direto do S3 que o processo está para ser buscado.
//
// Nunca sobrescreve um arquivo existente: processos que não estão no Athena
// podem já ter dado real em comunicacao-spot (gravado por outro coletor,
// ex.: communication-ingestor-juri, que nunca alimentou o Athena). Nesse
// caso, em vez de só avisar e não fazer nada, aproveita esse JSON já
// existente e joga pro cache no Redis (mesmo formato que
// `FindProcessoService` já prioriza sobre o Athena) — assim o processo passa
// a "existir" pro app imediatamente, sem precisar re-buscar do zero no PJe.
@Injectable()
export class InsertLawsuitPlaceholderService {
  private readonly logger = new Logger(InsertLawsuitPlaceholderService.name);
  private readonly s3Client: S3Client;
  private readonly location: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheProcessoToRedisService: CacheProcessoToRedisService,
    private readonly fetchComunicacaoSpotService: FetchComunicacaoSpotService,
  ) {
    const accessKeyId = this.configService.get<string>('ATHENA_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'ATHENA_SECRET_ACCESS_KEY',
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('ATHENA_REGION') || 'sa-east-1',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.location = this.configService.getOrThrow<string>(
      'COMUNICACAO_SPOT_LOCATION',
    );
  }

  async execute(numeroCnj: string) {
    const ref = resolveComunicacaoSpotObject(this.location, numeroCnj);
    if (!ref) {
      throw new BadRequestException('Número de processo inválido');
    }

    const existente = await this.fetchComunicacaoSpotService.execute(numeroCnj);
    if (existente) {
      this.logger.log(
        `Já existe registro em comunicacao-spot pra ${numeroCnj} (s3://${ref.bucket}/${ref.key}) — aproveitando pra cache no Redis.`,
      );

      await this.cacheProcessoToRedisService.execute(existente);

      return {
        message:
          'Processo já possuía registro em comunicacao-spot — cache atualizado no Redis',
        alreadyExists: true,
        cached: true,
      };
    }

    const placeholder = buildBuscandoPlaceholder(numeroCnj);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        Body: JSON.stringify(placeholder),
        ContentType: 'application/json',
      }),
    );

    this.logger.log(
      `Criado marcador BUSCANDO em s3://${ref.bucket}/${ref.key}`,
    );

    return {
      message: 'Processo inserido em comunicacao-spot',
      alreadyExists: false,
      cached: false,
    };
  }
}
