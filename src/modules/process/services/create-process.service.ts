import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { JobsOptions, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { CreateProcessSchemaBody } from '../dtos/create.dto';
import { Process } from '../schema/process.schema';

@Injectable()
export class CreateProcessService {
  private readonly logger = new Logger(CreateProcessService.name);

  constructor(
    @InjectModel(Process.name)
    private readonly processModule: Model<Process>,
    @InjectQueue('insert-process-queue')
    private readonly processQueue: Queue,
  ) {}

  async execute(body: CreateProcessSchemaBody) {
    try {
      const newArray: string[] = [];

      // Processamento em paralelo para verificar processos existentes
      const findProcesses = await Promise.all(
        body.processes.map((process) =>
          this.processModule.findOne({ number: process }),
        ),
      );

      body.processes.forEach((process, index) => {
        if (!findProcesses[index]) {
          newArray.push(process);
        }
      });

      if (newArray.length === 0) {
        return { message: 'All processes already exist in database.' };
      }

      // Divisão em lotes para adicionar à fila
      const batchSize = 100;
      for (let i = 0; i < newArray.length; i += batchSize) {
        const batch = newArray.slice(i, i + batchSize);
        const jobs = batch.map((process) => ({
          name: 'insert-process',
          data: { processNumber: process },
        }));

        try {
          const jobOptions: JobsOptions = {
            removeOnComplete: true,
            attempts: 3,
          };
          await Promise.all(
            jobs.map((job) =>
              this.processQueue.add(job.name, job.data, jobOptions),
            ),
          );
        } catch (queueError: unknown) {
          const qe = queueError as Error & { name?: string };
          if (
            qe.name?.includes('Redis') ||
            qe.message?.includes('redis') ||
            qe.message?.includes('MaxRetriesPerRequestError')
          ) {
            this.logger.warn(
              `[CreateProcessService] Redis unavailable, processes will need to be added manually: ${batch.join(', ')}`,
            );
            return {
              message:
                'Processes identified but could not be added to queue (Redis unavailable). Manual processing may be required.',
              processes: batch,
              queueError: true,
            };
          }
          throw qe;
        }
      }

      return { message: 'Processes added to queue for processing.' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
