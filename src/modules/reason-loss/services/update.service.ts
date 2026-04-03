import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateReasonLossDTO } from '../dto/create.dto';
import { ReasonLoss } from '../schema/reason-refusal.schema';

@Injectable()
export class UpdateReasonLossService {
  constructor(
    @InjectModel(ReasonLoss.name)
    private readonly reasonLossRepository: Model<ReasonLoss>,
  ) {}

  async execute(id: string, body: Partial<CreateReasonLossDTO>) {
    try {
      const { key, label } = body;
      const findReasonLoss = await this.reasonLossRepository.findOne({ key });
      if (findReasonLoss) {
        throw new BadRequestException('Reason Loss already exists');
      }
      const reasonLoss = await this.reasonLossRepository.findByIdAndUpdate(
        id,
        {
          label,
        },
        { new: true },
      );
      return { reasonLoss };
    } catch (error) {
      throw error;
    }
  }
}
