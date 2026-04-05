import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { CreateProcessSchemaBody } from '../dtos/create.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Process } from '../schema/process.schema';
import { Model } from 'mongoose';

@Injectable()
export class CreateProcessService {
  constructor(
    @InjectQueue('process-queue') private readonly processQueue: Queue,
    @InjectModel(Process.name)
    private readonly processModule: Model<Process>,
  ) {}
  async execute(body: CreateProcessSchemaBody) {
    try {
      const newArray: any[] = [];

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
          await this.processQueue.addBulk(jobs);
        } catch (queueError: any) {
          if (
            queueError.name?.includes('Redis') ||
            queueError.message?.includes('redis') ||
            queueError.message?.includes('MaxRetriesPerRequestError')
          ) {
            console.warn(
              `[CreateProcessService] Redis unavailable, processes will need to be added manually: ${batch.join(', ')}`,
            );
            return {
              message:
                'Processes identified but could not be added to queue (Redis unavailable). Manual processing may be required.',
              processes: batch,
              queueError: true,
            };
          }
          throw queueError;
        }
      }

      return { message: 'Processes added to queue for processing.' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
