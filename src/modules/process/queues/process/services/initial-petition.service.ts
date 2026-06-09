import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { ClaimedProcesses } from 'src/modules/process/schema/claimed-processes.schema';
import { Company } from 'src/modules/process/schema/company.schema';
import { Complainant } from 'src/modules/process/schema/complainant.schema';
import { Process as ProcessEntity, RestrictedDocument } from 'src/modules/process/schema/process.schema';
import PipedriveService from 'src/service/pipedrive/pipedrive';
import { normalizeString } from 'src/utils/normalize-string';

@Injectable()
export class InitialPetitionService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    @InjectModel(ClaimedProcesses.name)
    private readonly claimedModel: Model<ClaimedProcesses>,
    @InjectModel(Complainant.name)
    private readonly complainantModel: Model<Complainant>,
    private readonly pipedriveService: PipedriveService,
    @InjectQueue('insert-process-queue')
    private readonly processQueue: Queue,
  ) {}

  async execute(processNumber: string) {
    this.logger.log(`Inicial Peticion Job ${processNumber}`);
    try {
      const findProcess = await this.processModule.findOne({
        number: processNumber,
      });

      if (findProcess.class !== 'MAIN') {
        const peticaoInicialDoc = findProcess.documents.find((item) =>
          /.*peticao.*inicial.*/i.test(normalizeString(item.title)),
        );

        const findProcessMain = await this.processModule.findOne({
          $or: [
            { number: peticaoInicialDoc?.data?.numero_processo_principal },
            { _id: findProcess.processMain },
          ],
          class: 'MAIN',
        });

        if (findProcess.processMain) {
          await this.processModule.findByIdAndUpdate(findProcess._id, {
            processMain: findProcessMain?._id,
            processNumberMain: findProcessMain?.number,
          });
        }

        if (
          !findProcessMain &&
          peticaoInicialDoc?.data?.numero_processo_principal
        ) {
          const called = await this.callToGetMainLawsuit(
            peticaoInicialDoc.data.numero_processo_principal as string,
            findProcess,
          );
          if (!called) {
            this.logger.error(
              `Error in request MainLawsuit ${peticaoInicialDoc.data.numero_processo_principal as string}`,
            );
          }
          return;
        }

        if (!findProcess.arquived) {
          return;
        }
      }
    } catch (error) {
      this.logger.error('Error in initial-petition-analysis: ', error);
      const processFound = await this.processModule.findOne({
        number: processNumber,
      });
      if (processFound?.dealId) {
        const complainant = await this.complainantModel.findOne({
          _id: processFound.complainant,
        });
        const claimed = await this.claimedModel
          .findOne({
            processId: processFound._id,
          })
          .populate({ path: 'companyId' });
        const company = claimed?.companyId as Company;
        await this.pipedriveService.updateApprovedLawsuit(
          complainant.name,
          company.name,
          processFound.dealId,
        );
      }
      throw error;
    } finally {
      this.logger.log(`Finished Peticion Job ${processNumber}`);
    }
  }

  async callToGetMainLawsuit(
    mainLawsuitNumber: string,
    provisionalNumber: ProcessEntity,
  ) {
    try {
      const finProcessMain = await this.processModule.findOne({
        number: mainLawsuitNumber,
      });
      if (finProcessMain) {
        await this.processModule.findOneAndUpdate(
          { number: mainLawsuitNumber },
          {
            calledByProvisionalLawsuitNumber: provisionalNumber.number,
          },
        );
      } else {
        this.logger.log('Chamando extração do processo principal');
        await this.processQueue.add('insert-process', {
          processNumber: mainLawsuitNumber,
          calledByInitialPetitionProvisionalNumber: provisionalNumber?.number,
        });
      }
      return true;
    } catch (error) {
      this.logger.error('Error in request MainLawsuit: ', error);
      return false;
    }
  }

  isProcessArchived(process: ProcessEntity): boolean {
    return (
      process?.instancias.find(
        (instancia) => instancia.instancia === 'PRIMEIRO_GRAU',
      ).arquivado === true
    );
  }

  findMostRecentPeticaoInicial(
    docs: RestrictedDocument[] = [],
  ): RestrictedDocument | null {
    if (!docs.length) {
      return null;
    }
    return docs.reduce((latest, current) => {
      return new Date(current.date ?? '') > new Date(latest.date ?? '')
        ? current
        : latest;
    });
  }
}
