import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReasonLoss } from '../schema/reason-refusal.schema';

@Injectable()
export class DeleteReasonLossService {
  constructor(
    @InjectModel(ReasonLoss.name)
    private readonly reasonLossRepository: Model<ReasonLoss>,
  ) {}

  async execute(id: string) {
    try {
      const findReasonLoss = await this.reasonLossRepository.findById(id);
      if (!findReasonLoss) {
        throw new BadRequestException('Reason Loss not found');
      }
      await this.reasonLossRepository.findByIdAndDelete(id);
      return { message: 'Reason Loss deleted successfully' };
    } catch (error) {
      throw error;
    }
  }
}
