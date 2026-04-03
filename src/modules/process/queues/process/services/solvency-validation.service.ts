import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';
import { ClaimedProcesses } from 'src/modules/process/schema/claimed-processes.schema';
import { Company } from 'src/modules/process/schema/company.schema';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { Step } from 'src/modules/process/schema/step.schema';
import { sleep } from 'src/utils/sleep';

@Injectable()
export class SolvencyValidationService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(Company.name)
    private readonly companyModule: Model<Company>,
    @InjectModel(Step.name) private readonly stepModule: Model<Step>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModule: Model<ProcessStatus>,
    @InjectModel(ClaimedProcesses.name)
    private readonly claimedProcessesModule: Model<ClaimedProcesses>,
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
  ) {}
  async execute(processNumber) {
    try {
      const processAggregate = await this.processModule.aggregate([
        { $match: { number: processNumber } },
        {
          $lookup: {
            from: 'claimedprocesses',
            localField: '_id',
            foreignField: 'processId',
            as: 'claimedProcesses',
          },
        },
        {
          $unwind: {
            path: '$claimedProcesses',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'companies',
            localField: 'claimedProcesses.companyId',
            foreignField: '_id',
            as: 'companies',
          },
        },
        { $unwind: { path: '$companies', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'processstatuses',
            localField: 'processStatus',
            foreignField: '_id',
            as: 'processStatus',
          },
        },
        {
          $unwind: { path: '$processStatus', preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: '$_id',
            number: { $first: '$number' },
            processStatus: { $first: '$processStatus' },
            dealId: { $first: '$dealId' },
            companies: { $push: '$companies' },
            instancias: { $first: '$instancias' },
            complainant: { $first: '$complainant' },
            processParts: { $first: '$processParts' },
            documents: { $first: '$documents' },
          },
        },
        {
          $project: {
            _id: 1,
            number: 1,
            processStatus: 1,
            companies: 1,
            dealId: 1,
            instancias: 1,
            processParts: 1,
            complainant: 1,
            documents: 1,
          },
        },
        { $limit: 1 },
      ]);
      const findProcess = processAggregate[0];

      if (!findProcess) {
        this.logger.warn(`Processo ${processNumber} não encontrado no banco.`);
        return;
      }

      const companies = this.filterReclamadas(findProcess.processParts);

      this.logger.log(`Encontradas ${companies.length} empresas para validar.`);

      // Garantindo execução síncrona de cada empresa
      for (const company of companies) {
        this.logger.log(
          `Iniciando validação da empresa: ${company.documento.numero}`,
        );
        if (company.documento?.tipo !== 'CNPJ') {
          this.logger.log(
            `Documento ${company.documento.numero} não é CNPJ. Pulando...`,
          );
          continue;
        }
        const companyData = await this.fetchCompany(company.documento.numero);
        this.logger.log(
          `Dados recebidos da empresa: ${company.documento.numero}`,
        );
        if (!companyData) {
          this.logger.error(
            `Nenhum dado encontrado para a empresa: ${company.documento.numero}`,
          );
          continue;
        }
        await this.createOrUpdateCompanyData(companyData, findProcess._id);
        findProcess.processParts = findProcess.processParts.map((parte) => {
          if (
            parte.documento &&
            parte.documento.numero === company.documento.numero
          ) {
            return {
              ...parte,
              nome: companyData.razao || parte.nome,
            };
          }
          return parte;
        });

        await this.processModule.findByIdAndUpdate(findProcess._id, {
          processParts: findProcess.processParts,
        });
        this.logger.log(
          `Empresa ${company.documento.numero} atualizada com sucesso`,
        );
      }
      const namesStatuses =
        findProcess.processStatus.name ===
        PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS
          ? PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED
          : PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS;
      const nextStep =
        findProcess.processStatus.name ===
        PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS
          ? 'step-4'
          : 'step-3';
      const step = await this.stepModule.findOne({
        slug: nextStep,
      });
      await this.processStatusModule.findByIdAndUpdate(
        findProcess.processStatus,
        {
          step: step?._id,
          name: namesStatuses,
        },
      );
      this.logger.debug('AGUARDANDO EXTRAÇÃO DE DOCUMENTOS');
      // if (findProcess.processStatus.name) {
      // } else {
      //   this.logger.log('Processo já possui documentos');
      //   const step = await this.stepModule.findOne({
      //     slug: 'step-4',
      //   });
      //   await this.processStatusModule.findByIdAndUpdate(
      //     findProcess.processStatus,
      //     {
      //       step: step?._id,
      //       name: 'Extração finalizada',
      //       log: '',
      //     },
      //   );
      // }
    } catch (error) {
      this.logger.error(`Erro ao validar processo ${processNumber}`, error);
      throw error; // Mantemos o throw para o Bull capturar o erro no job
    }
  }

  filterReclamadas(parts) {
    const reuKeywords = [
      'reu',
      'reclamado',
      'requerido',
      'polo passivo',
      'executado',
    ];
    return (
      parts?.filter(
        (item) =>
          (reuKeywords.some((keyword) =>
            item.tipo
              ?.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .includes(keyword),
          ) &&
            item.principal) ||
          (item.polo === 'PASSIVO' && item.documento?.tipo === 'CNPJ'),
      ) || []
    );
  }

  // Função auxiliar para salvar os dados da empresa
  private async createOrUpdateCompanyData(companyData: any, processId: string) {
    const existingCompany = await this.companyModule.findOne({
      cnpj: companyData.cnpj,
    });
    if (existingCompany) {
      const claimedProcesses = await this.claimedProcessesModule.findOne({
        companyId: existingCompany._id,
        processId,
      });
      if (!claimedProcesses) {
        await this.claimedProcessesModule.create({
          companyId: existingCompany._id,
          processId,
        });
      }

      return await this.companyModule.findByIdAndUpdate(
        existingCompany._id,
        {
          email: companyData?.email,
          fantasyName: companyData?.fantasia,
          legalNature: companyData?.natureza_juridica,
          registrationStatus: companyData?.situacao_cadastral,
          taxRegime: companyData?.regime_tributario,
          partners: companyData?.socios,
          socialCapital: companyData?.capital_social,
          invoicing: companyData?.faturamento,
          porte: companyData?.porte,
        },
        { new: true, timestamps: false },
      );
    } else {
      const createdCompany = await this.companyModule.create({
        name: companyData?.razao,
        cnpj: companyData?.cnpj,
        email: companyData?.email,
        fantasyName: companyData?.fantasia,
        legalNature: companyData?.natureza_juridica,
        registrationStatus: companyData?.situacao_cadastral,
        taxRegime: companyData?.regime_tributario,
        partners: companyData?.socios,
        socialCapital: companyData?.capital_social,
        invoicing: companyData?.faturamento,
        porte: companyData?.porte,
      });
      await this.claimedProcessesModule.create({
        companyId: createdCompany._id,
        processId,
      });
      console.log('Empresa criada com sucesso:', createdCompany);

      return createdCompany;
    }
  }

  // Agrupar socios da empresa
  transformarSocios(data) {
    const socios = [];
    // const dividas = [];

    // Filtrar e separar os dados de sócios e dívidas
    Object.keys(data).forEach((key) => {
      if (!isNaN(Number(key))) {
        const item = data[key];
        if (item.hasOwnProperty('socios_nome')) {
          socios.push(item); // Adicionar ao array de sócios
        }
        //  else if (item.hasOwnProperty('dividas_numero')) {
        //   dividas.push(item); // Adicionar ao array de dívidas
        // }
        delete data[key]; // Remover do objeto original
      }
    });

    // Adicionar os arrays de sócios e dívidas ao objeto original
    data.socios = socios;
    // data.dividas = dividas;

    return data;
  }

  // Buscar dados da empresa
  private async fetchCompany(cnpj) {
    try {
      if (cnpj === null) {
        return null;
      }

      await sleep(1500);
      console.log('Buscando dados da empresa');
      const { data } = await axios.get(
        `${process.env.BASE_URL_EMPRESAQUI}/${process.env.EMPRESAQUI_API_KEY}/${cnpj}`,
      );

      if (!data) {
        return null;
      }
      return await this.transformarSocios(data);
    } catch (error) {
      if (
        error?.response?.status === 429 &&
        error?.response?.statusText === 'Too Many Requests'
      ) {
        this.logger.log('Erro ao buscar dados da empresa, tentando novamnete');
        await sleep(30000);
        return this.fetchCompany(cnpj);
      } else if (error.response.status === 404) {
        this.logger.log('Empresa não encontrada', error);
      } else {
        this.logger.log('Erro ao buscar dados da empresa', error);
      }
      // throw new BadGatewayException('Erro ao buscar dados da empresa', error);
    }
  }
}
