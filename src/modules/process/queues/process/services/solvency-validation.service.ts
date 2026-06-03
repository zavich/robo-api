import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

interface EmpresaQuiData {
  cnpj: string;
  razao?: string;
  email?: string;
  fantasia?: string;
  natureza_juridica?: string;
  situacao_cadastral?: string;
  regime_tributario?: string;
  socios?: Record<string, unknown>[];
  capital_social?: string;
  faturamento?: string;
  porte?: string;
  calculoOwner?: string;
  [key: string]: unknown;
}
import axios from 'axios';
import { Model, Types } from 'mongoose';
import { PROCESSSTATUSENUM } from 'src/modules/process/enums/process-status.enum';
import { ClaimedProcesses } from 'src/modules/process/schema/claimed-processes.schema';
import { Company } from 'src/modules/process/schema/company.schema';
import { ProcessStatus } from 'src/modules/process/schema/process-status.schema';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { Step } from 'src/modules/process/schema/step.schema';
import { ProcessStateMachineService } from 'src/modules/process/services/process-state-machine.service';
import { sleep } from 'src/utils/sleep';

type CompanyWithId = Company & { _id: Types.ObjectId };

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
    private readonly processStateMachine: ProcessStateMachineService,
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

      const cnpjCompanies = companies.filter(
        (c) => c.documento?.tipo === 'CNPJ',
      );

      if (cnpjCompanies.length > 0) {
        // PERF-004: pré-carregar todas as empresas e claimed processes em batch
        const cnpjList = cnpjCompanies.map((c) => c.documento.numero);
        const [existingCompanies, existingClaimed] = await Promise.all([
          this.companyModule.find({ cnpj: { $in: cnpjList } }).lean(),
          this.claimedProcessesModule
            .find({ processId: findProcess._id })
            .lean(),
        ]);

        const companyByCnpj = new Map(
          existingCompanies.map((c) => [c.cnpj, c as CompanyWithId]),
        );
        const claimedCompanyIds = new Set(
          existingClaimed.map((cp) => String(cp.companyId)),
        );

        // PERF-004: buscar EmpresaQui sequencialmente (rate-limited) mas
        //           fazer as escritas em MongoDB em batch no final
        const updatedParts = [...findProcess.processParts];

        for (const company of cnpjCompanies) {
          const cnpj = company.documento.numero;
          this.logger.log(`Iniciando validação da empresa: ${cnpj}`);

          const companyData = await this.fetchCompany(cnpj);
          if (!companyData) {
            this.logger.error(`Nenhum dado encontrado para a empresa: ${cnpj}`);
            continue;
          }

          await this.createOrUpdateCompanyDataBatch(
            companyData,
            findProcess._id,
            companyByCnpj as Map<string, CompanyWithId>,
            claimedCompanyIds,
          );

          // Atualiza processParts em memória (1 update ao final do loop)
          for (let i = 0; i < updatedParts.length; i++) {
            if (updatedParts[i].documento?.numero === cnpj) {
              updatedParts[i] = {
                ...updatedParts[i],
                nome: companyData.razao || updatedParts[i].nome,
              };
            }
          }

          this.logger.log(`Empresa ${cnpj} atualizada com sucesso`);
        }

        // PERF-004: um único update no processModule ao fim
        await this.processModule.findByIdAndUpdate(findProcess._id, {
          processParts: updatedParts,
        });
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
      await this.processStateMachine.transition(
        this.processStatusModule,
        findProcess.processStatus,
        {
          step: step?._id,
          name: namesStatuses,
        },
      );
      this.logger.debug('AGUARDANDO EXTRAÇÃO DE DOCUMENTOS');
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

  // PERF-004: versão batch que reutiliza dados pré-carregados
  private async createOrUpdateCompanyDataBatch(
    companyData: EmpresaQuiData,
    processId: string,
    companyByCnpj: Map<string, CompanyWithId>,
    claimedCompanyIds: Set<string>,
  ) {
    const existingCompany = companyByCnpj.get(companyData.cnpj);
    const updateFields = {
      email: companyData?.email,
      fantasyName: companyData?.fantasia,
      legalNature: companyData?.natureza_juridica,
      registrationStatus: companyData?.situacao_cadastral,
      taxRegime: companyData?.regime_tributario,
      partners: companyData?.socios,
      socialCapital: companyData?.capital_social,
      invoicing: companyData?.faturamento,
      porte: companyData?.porte,
    };

    if (existingCompany) {
      if (!claimedCompanyIds.has(String(existingCompany._id))) {
        await this.claimedProcessesModule.create({
          companyId: existingCompany._id,
          processId,
        });
        claimedCompanyIds.add(String(existingCompany._id));
      }
      return this.companyModule.findByIdAndUpdate(
        existingCompany._id,
        updateFields,
        { new: true, timestamps: false },
      );
    } else {
      const createdCompany = await this.companyModule.create({
        name: companyData?.razao,
        cnpj: companyData?.cnpj,
        ...updateFields,
      });
      companyByCnpj.set(companyData.cnpj, createdCompany);
      await this.claimedProcessesModule.create({
        companyId: createdCompany._id,
        processId,
      });
      claimedCompanyIds.add(String(createdCompany._id));
      return createdCompany;
    }
  }

  // Função auxiliar legada para salvar os dados da empresa
  private async createOrUpdateCompanyData(companyData: EmpresaQuiData, processId: string) {
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
      this.logger.log(`Empresa criada com sucesso: ${String(createdCompany._id)}`);

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

  // Buscar dados da empresa com retry limitado (BUG-005)
  private async fetchCompany(cnpj: string, attempt = 0): Promise<EmpresaQuiData | null> {
    const MAX_ATTEMPTS = 5;

    if (cnpj === null) {
      return null;
    }

    try {
      await sleep(1500);
      this.logger.log(`Buscando dados da empresa ${cnpj} (tentativa ${attempt + 1}/${MAX_ATTEMPTS})`);
      const { data } = await axios.get(
        `${process.env.BASE_URL_EMPRESAQUI}/${process.env.EMPRESAQUI_API_KEY}/${cnpj}`,
      );

      if (!data) {
        return null;
      }
      return await this.transformarSocios(data);
    } catch (error) {
      const status = error?.response?.status;

      if (status === 429 && attempt < MAX_ATTEMPTS - 1) {
        const delay = Math.min(30000 * Math.pow(2, attempt), 300000); // max 5 min
        this.logger.warn(
          `EmpresaQui 429 para ${cnpj} — retry ${attempt + 1}/${MAX_ATTEMPTS} em ${delay / 1000}s`,
        );
        await sleep(delay);
        return this.fetchCompany(cnpj, attempt + 1);
      } else if (status === 429) {
        this.logger.error(`EmpresaQui 429 para ${cnpj} — maximo de tentativas atingido`);
        return null;
      } else if (status === 404) {
        this.logger.log(`Empresa ${cnpj} não encontrada na EmpresaQui`);
        return null;
      } else {
        this.logger.error(`Erro ao buscar dados da empresa ${cnpj}:`, error?.message);
        return null;
      }
    }
  }
}
