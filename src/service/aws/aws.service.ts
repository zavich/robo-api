import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { PublishCommand, PublishCommandInput } from '@aws-sdk/client-sns';
import { BadRequestException, Logger } from '@nestjs/common';
import * as mimeTypes from 'mime-types';
import * as fs from 'fs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class AwsServices {
  async sendEmail(to: any, subject: any, text: any) {
    const params: SendEmailCommandInput = {
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: text,
          },
        },

        Subject: { Data: subject },
      },
      Source: 'gabriel@paguru.com.br',
    };

    try {
      const command = new SendEmailCommand(params);
      console.log(command);

      // await sesClient.send(command);
    } catch (error) {
      console.error('Error sending email', error);
    }
  }

  async sendSMS(message: string, phoneNumber: string): Promise<void> {
    const params: PublishCommandInput = {
      Message: message,
      MessageStructure: 'string',
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    };

    try {
      const command = new PublishCommand(params);
      console.log('command', command);
      // await snsClient.send(command);
    } catch (error) {
      Logger.error('Error sending sms' + error);
      throw new BadRequestException('Error send sms');
    }
  }

  async deleteImageS3(key: string) {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: key,
    };

    const command = new DeleteObjectCommand(params);

    try {
      await this.s3Client.send(command);
      console.log(`Arquivo ${key} excluído com sucesso do S3.`);
    } catch (error) {
      Logger.error(`Erro ao excluir o arquivo ${key} do S3:`, error);

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
      Logger.error(`Erro ao realizar upload do arquivo  do S3:`, error);
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
      Logger.error(`Erro ao gerar URL assinada para o arquivo ${key}:`, error);
      throw error;
    }
  }
  private s3Client = new S3Client({
    region: process.env.AWS_S3_REGION as string,
    credentials: {
      accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY as string,
    },
  });
}
