import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { Root } from 'src/modules/process/interfaces/process.interface';
import { resolveComunicacaoSpotObject } from '../utils/comunicacao-spot-object.util';

// Lê o JSON de um processo direto de comunicacao-spot (S3). Usado só por
// `InsertLawsuitPlaceholderService`, e só pra checar se já existe algo ali
// (nunca sobrescrever um registro de outro coletor) — comunicacao-spot não é
// mais fonte de consulta (a consulta de processo é só Redis + Athena, ver
// `FindProcessoService`), então ninguém mais deve interpretar o conteúdo
// devolvido aqui pra decidir uma resposta de busca.
@Injectable()
export class FetchComunicacaoSpotService {
  private readonly logger = new Logger(FetchComunicacaoSpotService.name);
  private readonly s3Client: S3Client;
  private readonly location: string;

  constructor(private readonly configService: ConfigService) {
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

  async execute(numeroCnj: string): Promise<Root | null> {
    const ref = resolveComunicacaoSpotObject(this.location, numeroCnj);
    if (!ref) {
      throw new BadRequestException('Número de processo inválido');
    }

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
      );
      const raw = await response.Body?.transformToString('utf-8');
      return raw ? (JSON.parse(raw) as Root) : null;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null;
      }
      this.logger.warn(
        `Falha ao buscar JSON em s3://${ref.bucket}/${ref.key}, assumindo que não existe: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
