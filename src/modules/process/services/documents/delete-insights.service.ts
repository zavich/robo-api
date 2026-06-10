import { BadRequestException, Injectable } from '@nestjs/common';
import { Process } from '../../schema/process.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StatusExtractionInsight } from '../../enums/status-extraction-insight.enum';

@Injectable()
export class DeleteInsightsDocumentService {
  constructor(
    @InjectModel(Process.name)
    private readonly lawsuitModel: Model<Process>,
  ) {}

  async execute(lawsuit: string, id: string) {
    try {
      const findLawsuit = await this.lawsuitModel.findOne({ number: lawsuit });
      if (!findLawsuit) {
        throw new BadRequestException('Lawsuit not found');
      }
      const updatedLawsuit = await this.lawsuitModel.findOneAndUpdate(
        {
          number: lawsuit,
          'documents._id': id,
        },
        {
          $set: {
            'documents.$.data': null,
            'documents.$.status': StatusExtractionInsight.PENDING,
          },
        },
        { new: true },
      );

      if (!updatedLawsuit) {
        throw new BadRequestException('Document not found');
      }

      return { message: 'Insights deleted successfully' };
    } catch (error) {
      throw error;
    }
  }
}
