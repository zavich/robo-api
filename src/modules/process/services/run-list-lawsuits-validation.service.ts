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
  async execute(lawsuits: string[], documents: boolean = false) {
    await Promise.all(
      lawsuits.map(async (lawsuit) => {
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
