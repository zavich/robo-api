import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Process as ProcessEntity,
  Situation,
} from 'src/modules/process/schema/process.schema';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { ProcessStatus } from '../schema/process-status.schema';
import { Step } from '../schema/step.schema';
import { InsertProcessService } from '../queues/process/services/insert-process.service';

@Injectable()
export class LawsuitValidationService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    private readonly nextStepsService: NextStepsService,
    private readonly insertProcessService: InsertProcessService,

    @InjectModel(ProcessStatus.name)
    private readonly processStatusService: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepService: Model<Step>,
  ) {}

  async execute(number: string, step: string, isAll: boolean) {
    try {
      if (isAll) {
        console.log('Executing Lawsuit Validation');
        const processes = await this.processModule.aggregate([
          {
            $lookup: {
              from: 'processstatuses',
              localField: 'processStatus',
              foreignField: '_id',
              as: 'processStatus',
            },
          },
          { $unwind: '$processStatus' },
          {
            $lookup: {
              from: 'steps',
              localField: 'processStatus.step',
              foreignField: '_id',
              as: 'processStatus.step',
            },
          },
          { $unwind: '$processStatus.step' },
          {
            $match: {
              'processStatus.errorReason':
                'Documento da petição inicial não encontrado ou não acessível',
              instanciasAutosWithDocs: { $size: 0 },
            },
          },
          { $limit: 2 },
        ]);
        const findStep = await this.stepService.findOne({
          slug: step,
        });

        await Promise.all(
          processes.map(async (process) => {
            if (process.instanciasAutosWithDocs.length > 0) {
              this.logger.warn(
                `Process ${process.number} already has documents in the autos`,
              );
              return;
            }
            await this.processModule.findByIdAndUpdate(
              process._id,
              {
                $set: {
                  situation: Situation.PENDING,
                },
              },
              { new: true },
            );
            await this.processStatusService.findByIdAndUpdate(
              process.processStatus._id,
              {
                $set: {
                  log: null,
                  errorReason: null,
                  step: findStep._id,
                },
              },
            );
            console.log(`Processing: ${process.number}`);
            return this.nextStepsService.execute(step, {
              processNumber: process.number,
              mainProcessId:
                process.class === 'MAIN' ? process._id : process.processMain,
            });
          }),
        );
      } else {
        const process: any = await this.processModule
          .findOne({ number })
          .populate({ path: 'processStatus', populate: ['step'] });
        await this.processModule.findByIdAndUpdate(
          process._id,
          {
            $set: {
              situation: 'IN_PROGRESS',
            },
          },
          { new: true },
        );
        const findStep = await this.stepService.findOne({
          slug: step,
        });
        await this.processStatusService.findByIdAndUpdate(
          process.processStatus._id,
          {
            $set: {
              log: null,
              errorReason: null,
              step: findStep._id,
            },
          },
        );
        if (!process) {
          throw new Error('Process not found');
        }
        console.log(`Processing: ${process.number} ${step}`);
        if (process.processStatus.step.slug === 'step-0') {
          return this.insertProcessService.fetchProcessExtract(
            process.number,
            process,
          );
        }
        if (step) {
          return this.nextStepsService.execute(step, {
            processNumber: process.number,
            mainProcessId:
              process.class === 'MAIN' ? process._id : process.processMain,
          });
        }

        return this.nextStepsService.execute(process.processStatus.step.slug, {
          processNumber: process.number,
          mainProcessId:
            process.class === 'MAIN' ? process._id : process.processMain,
        });
      }
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
