import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

// Dispara a extração no scraping-robo-api direto pelo número do processo, sem
// nenhuma leitura/escrita no Mongo (Process/ProcessStatus) — o módulo lawsuits
// é a nova base (Athena), então evitamos aprofundar o acoplamento com o schema
// antigo que está sendo substituído.
@Injectable()
export class TriggerScrapingService {
  private readonly logger = new Logger(TriggerScrapingService.name);

  async execute(numeroCnj: string) {
    try {
      await axios.post(
        `${process.env.SCRAPING_BASE_URL}/processos/${numeroCnj}`,
        { documents: true, priority: true },
        {
          headers: {
            Authorization: `Bearer ${process.env.SCRAPING_API_KEY}`,
          },
        },
      );

      return { message: 'Processo enviado para extração' };
    } catch (error) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as
        | { error?: string; message?: string }
        | string
        | undefined;
      const errorDetail =
        (typeof responseData === 'string'
          ? responseData
          : responseData?.error || responseData?.message) ||
        axiosError.message ||
        'Erro não detalhado pelo serviço de extração';

      this.logger.error(
        `Erro ao enviar ${numeroCnj} para extração: ${errorDetail}`,
      );
      throw new BadGatewayException(
        'Erro ao disparar extração no scraping-robo-api',
      );
    }
  }
}
