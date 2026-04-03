import { BadRequestException, Injectable } from '@nestjs/common';
import { Process } from '../../schema/process.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class FindOneDocumentService {
  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModel: Model<Process>,
  ) {}

  async execute(lawsuit: string, id: number) {
    try {
      const findLawsuit = await this.lawsuitModel.findOne({ number: lawsuit });
      if (!findLawsuit) {
        throw new BadRequestException('Lawsuit not found');
      }
      const documents = findLawsuit?.documents?.find((doc) => {
        return doc._id.toString() === id.toString();
      });
      if (!documents) {
        throw new BadRequestException('Document not found');
      }
      return documents;
    } catch (error) {
      throw error;
    }
  }
}
