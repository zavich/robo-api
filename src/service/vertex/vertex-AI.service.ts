import { GenerateContentRequest, Part, VertexAI } from '@google-cloud/vertexai';
import { BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AxiosError } from 'axios';
import { Model } from 'mongoose';
import { Prompt } from 'src/modules/process/schema/prompt.schema';

export class VertexAIService {
  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<Prompt>,
  ) {}

  /**
   * Método utilitário para buscar prompt por tipo
   * Permite usar qualquer string como tipo, não restrito ao enum
   */
  private async getPromptByType(type: string): Promise<string> {
    const prompt = await this.promptModel.findOne({ type });
    return prompt?.text || '';
  }

  async executeWithRetry(
    file_url: string,
    prompt: string,
    fileMimeType = 'application/pdf',
    retries = 3,
    delayMs = 3000,
    cooldownAfterSuccessMs = 3000,
  ): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.execute(file_url, prompt, fileMimeType);

        // Cooldown para evitar próxima chamada muito rápida
        if (cooldownAfterSuccessMs > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, cooldownAfterSuccessMs),
          );
        }

        return result;
      } catch (error) {
        const statusCode = error?.response?.status || error?.status;

        if (statusCode === 429) {
          const backoff = attempt * delayMs;
          console.warn(
            `[RateLimit] Tentativa ${attempt}/${retries} falhou com 429. Aguardando ${backoff / 1000}s antes da próxima tentativa...`,
          );

          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
        }

        // Outros erros (não 429 ou sem mais tentativas)
        throw error;
      }
    }
  }

  async execute(
    file_url: string,
    prompt: string,
    fileMimeType = 'application/pdf',
  ): Promise<any> {
    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: process.env.GOOGLE_VERTEX_LOCATION,
        googleAuthOptions: {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        },
      });
      const generativeModel = vertexAI.getGenerativeModel({
        model: process.env.GOOGLE_VERTEX_MODEL,
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          responseMimeType: 'application/json',
        },
      });
      const filePart = {
        file_data: {
          mime_type: fileMimeType,
          file_uri: file_url,
        },
      };
      const textPart = {
        text: prompt,
      };

      if (!prompt || !file_url) {
        throw new BadRequestException(
          'The prompt and the file url are required',
        );
      }

      const request: GenerateContentRequest = {
        contents: [
          {
            role: 'user',
            parts: [filePart as unknown as Part, textPart as Part],
          },
        ],
      };

      const resp = await generativeModel.generateContent(request);
      const contentResponse = await resp.response;
      const jsonParsed = JSON.parse(
        contentResponse.candidates[0].content.parts[0].text,
      );
      return jsonParsed;
    } catch (error) {
      const AxiosError = error as AxiosError;
      throw new BadRequestException(AxiosError);
    }
  }

  public async getPromptProcessoPrincipal(): Promise<string> {
    return await this.getPromptByType('PeticaoInicial');
  }

  public getPromptExecucaoProvisoria(): string {
    return `
    Você é um analista de Execuções Provisórias. Extraia o número do processo ao qual é diferente da Execução Provisória se refere.
    schema: {
      numero_processo_principal: {
        type: 'string',
        description: 'Numero do processo principal',
      }
    }
    `;
  }
  public async getPromptDocumentAlvara(): Promise<string> {
    return await this.getPromptByType('Alvara');
  }
  public async getPromptDocumentAcordo(): Promise<string> {
    return await this.getPromptByType('HomologacaoDeAcordo');
  }

  public async getPromtDocumentParcelamento916Alvara(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'AcordoEParcelamento',
    });
    return prompt.text;
  }

  public async getPromptDocumentHomologacao(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'Homologacao',
    });
    return prompt.text;
  }

  public async getPromptDocumentPlanilhaCalculo(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'PlanilhaCalculo',
    });
    return prompt.text;
  }

  public async getPromptDocumentAcordao(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'Acordao',
    });
    return prompt.text;
  }

  public async getPromptDocumentAcordaoMerito(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'AcordaoMerito',
    });
    return prompt.text;
  }

  public async getPromptDocumentAdmissibilityDecision(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'AdmissibilidadeRR',
    });
    return prompt.text;
  }
  public async getPromptDocumentRecursoDeRevista(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'RecursoDeRevista',
    });
    return prompt.text;
  }

  public async getPromptDocumentParametersDecisao(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'Decisao',
    });
    return prompt.text;
  }

  public async getPromptDocumentParametersSentencaMerito(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'SentencaMerito',
    });
    return prompt.text;
  }

  public async getPromptDocumentParametersSentencaED(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'SentencaED',
    });
    return prompt.text;
  }

  public async getPromptDocumentParametersSentencaEE(): Promise<string> {
    const prompt = await this.promptModel.findOne({
      type: 'SentencaEE',
    });
    return prompt.text;
  }

  public getPromptIdentifyProvisionalExecution(processNumber?: string): string {
    if (processNumber) {
      return `
        Extraia o número do processo apenas se ele estiver precedido por "CumPrSe" ou "ExProvAS".
        Verificar se o numero do processo diferente de ${processNumber}, caso seja igual extrair outro numero de processo que identificar ou retornar null.
        Retorne o resultado no seguinte formato: json
        schema: {
          "numero_execucao_provisorio": "XXXXXXXX-XX.XXXX.X.XX.XXXX"
        }
      `;
    }
    return `
      Extraia o número do processo apenas se ele estiver precedido por "CumPrSe" ou "ExProvAS".
      Retorne o resultado no seguinte formato: json
      schema: {
        "numero_execucao_provisorio": "XXXXXXXX-XX.XXXX.X.XX.XXXX"
      }
    `;
  }
  public async getPromptDocumentGarantia(): Promise<string> {
    return await this.getPromptByType('Garantia');
  }
}
