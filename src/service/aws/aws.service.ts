import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as mimeTypes from 'mime-types';

export class AwsServices {
  private readonly logger = new Logger(AwsServices.name);

  async deleteImageS3(key: string) {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: key,
    };

    const command = new DeleteObjectCommand(params);

    try {
      await this.s3Client.send(command);
      this.logger.log(`Arquivo ${key} excluído com sucesso do S3.`);
    } catch (error) {
      this.logger.error(
        `Erro ao excluir o arquivo ${key} do S3: ${error instanceof Error ? error.stack : String(error)}`,
      );

      throw error;
    }
  }

  async uploadImageS3(file: string, fileName = 'document.pdf') {
    try {
      const fileContent = fs.readFileSync(file);

      const contentType =
        mimeTypes.lookup(fileName) || 'application/octet-stream';

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: `${Date.now()}-${fileName}`,
        Body: fileContent,
        ContentType: contentType,
      };
      const command = new PutObjectCommand(params);

      await this.s3Client.send(command);
      return {
        fileName,
        key: params.Key,
        url: `https://${params.Bucket}.s3.amazonaws.com/${params.Key}`,
        type: params.ContentType,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao realizar upload do arquivo do S3: ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }
  async getSignedUrlS3(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600,
      }); // URL válida por 1 hora
      return signedUrl;
    } catch (error) {
      this.logger.error(
        `Erro ao gerar URL assinada para o arquivo ${key}: ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }
  private s3Client = new S3Client({
    region: process.env.AWS_S3_REGION || 'sa-east-1',
  });
}
