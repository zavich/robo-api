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
      for (const process of body.processes) {
        const findProcess = await this.processModule.findOne({
          number: process,
        });
        if (!findProcess) {
          newArray.push(process);
        }
      }
      
      if (newArray.length === 0) {
        return { message: 'All processes already exist in database.' };
      }

      const jobs = newArray.map((process) => ({
        name: 'insert-process',
        data: { processNumber: process },
      }));
      try {
        await this.processQueue.addBulk(jobs);
        return { message: 'Processes added to queue for processing.' };
      } catch (queueError: any) {
        if (queueError.name?.includes('Redis') || queueError.message?.includes('redis') || queueError.message?.includes('MaxRetriesPerRequestError')) {
          console.warn(`[CreateProcessService] Redis unavailable, processes will need to be added manually: ${newArray.join(', ')}`);
          return { 
            message: 'Processes identified but could not be added to queue (Redis unavailable). Manual processing may be required.',
            processes: newArray,
            queueError: true
          };
        }
        throw queueError;
      }
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
