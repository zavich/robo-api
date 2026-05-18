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

  async execute(
    number: string,
    step: string,
    isAll: boolean,
    startDate: string,
    endDate: string,
  ) {
    try {
      if (isAll) {
        console.log('Executing Lawsuit Validation');
        const start = new Date(`${startDate}T00:00:00.000-03:00`);
        const end = new Date(`${endDate}T23:59:59.999-03:00`);

        const processes = await this.processModule.aggregate([
          {
            $match: {
              documents: {
                $exists: true,
                $ne: [],
              },
              createdAt: { $gte: start, $lte: end },
            },
          },
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
        ]);
        const findStep = await this.stepService.findOne({
          slug: step,
        });
        for (const process of processes) {
          if (process.documents?.length === 0) {
            console.log(
              `Process ${process.number} has no documents, skipping...`,
            );
            continue;
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
          await this.nextStepsService.execute(step, {
            processNumber: process.number,
            mainProcessId:
              process.class === 'MAIN' ? process._id : process.processMain,
          });
        }
      } else {
        const process: any = await this.processModule
          .findOne({ number })
          .populate({ path: 'processStatus', populate: ['step'] });
        if (process.documents?.length === 0) {
          console.log(
            `Process ${process.number} has no documents, skipping...`,
          );
          return;
        }
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
