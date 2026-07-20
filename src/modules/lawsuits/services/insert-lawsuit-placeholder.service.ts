import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveComunicacaoSpotObject } from '../utils/comunicacao-spot-object.util';
import { buildBuscandoPlaceholder } from '../utils/buscando-placeholder.util';
import { FetchComunicacaoSpotService } from './fetch-comunicacao-spot.service';

// Insere um marcador "BUSCANDO" em comunicacao-spot pra um processo que
// ainda não tem registro lá — diferente de `SearchNewLawsuitService`, NÃO
// dispara extração nenhuma (sem custo de captcha), só sinaliza pra quem lê
// esses arquivos direto do S3 que o processo está para ser buscado.
//
// Comunicacao-spot só existe pra criar/atualizar esse documento — não é mais
// fonte de consulta pra ninguém (a consulta de processo é só Redis + Athena,
// ver `FindProcessoService`). Por isso, ao checar se já existe algo aqui,
// só olha se o objeto existe (pra nunca sobrescrever um registro gravado por
// outro coletor, ex.: communication-ingestor-juri, que nunca alimenta o
// Athena) — nunca interpreta o conteúdo pra decidir "achou"/"cached" nem
// escreve nada no Redis a partir daqui.
@Injectable()
export class InsertLawsuitPlaceholderService {
  private readonly logger = new Logger(InsertLawsuitPlaceholderService.name);
  private readonly s3Client: S3Client;
  private readonly location: string;

  constructor(
    private readonly configService: ConfigService,
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

    // Só existe pra decidir "já tem algo aqui, não mexo" vs "não tem nada,
    // crio o placeholder" — nunca interpreta o conteúdo (não é mais fonte de
    // consulta, ver `FindProcessoService`), e nunca escreve no Redis.
    const existente = await this.fetchComunicacaoSpotService.execute(numeroCnj);

    if (existente) {
      this.logger.log(
        `Já existe registro em comunicacao-spot pra ${numeroCnj} (s3://${ref.bucket}/${ref.key}) — não sobrescrevendo.`,
      );

      return {
        message: 'Processo já possuía registro em comunicacao-spot',
        alreadyExists: true,
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
    };
  }
}
