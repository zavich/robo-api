import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { InsertProcessService } from '../queues/process/services/insert-process.service';
import { ProcessStatus } from '../schema/process-status.schema';
import { Step } from '../schema/step.schema';

@Injectable()
export class RunListLawsuitsValidationService {
  private readonly logger = new Logger();

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    private readonly insertProcessService: InsertProcessService,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusService: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepService: Model<Step>,
  ) {}
  async execute(
    lawsuits: string[],
    documents: boolean = false,
    name?: string,
    log?: string,
    errorReason?: string,
  ) {
    let process: any[] = [];
    if (lawsuits.length === 0) {
      const filters = [];

      if (name) {
        filters.push({ 'processStatus.name': name });
      }

      if (errorReason) {
        filters.push({ 'processStatus.errorReason': errorReason });
      }

      if (log) {
        filters.push({ 'processStatus.log': log });
      }

      const pipeline: any[] = [
        {
          $lookup: {
            from: 'processstatuses',
            localField: 'processStatus',
            foreignField: '_id',
            as: 'processStatus',
          },
        },
        { $unwind: '$processStatus' },
      ];

      if (filters.length > 0) {
        pipeline.push({
          $match: {
            $and: filters,
          },
        });
      }

      pipeline.push({
        $project: {
          number: 1,
        },
      });
      const result = await this.processModule.aggregate(pipeline);
      process = result.map((item) => item.number);
    } else {
      process = lawsuits;
    }
    await Promise.all(
      process.map(async (lawsuit) => {
        const process: any = await this.processModule
          .findOne({ number: lawsuit })
          .populate({ path: 'processStatus', populate: ['step'] });
        if (!process) {
          this.logger.warn(`Process ${lawsuit} not found`);
          return;
        }
        await this.processModule.findByIdAndUpdate(
          process._id,
          {
            $set: {
              synchronizedAt: new Date(),
            },
          },
          { new: true },
        );
        const findStep = await this.stepService.findOne({
          slug: 'step-1',
        });
        await this.processStatusService.findByIdAndUpdate(
          process.processStatus._id,
          {
            $set: {
              step: findStep._id,
              errorReason: '',
            },
          },
          { new: true },
        );
        return this.insertProcessService.fetchProcessExtract(
          process.number,
          process,
          documents,
        );
      }),
    );
  }
}
