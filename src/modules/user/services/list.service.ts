import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schema/user.schema';

@Injectable()
export class ListUserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  /**
   * Deleta várias notificações pelo array de IDs
   */
  async execute() {
    try {
      const users = await this.userModel.find();
      return users;
    } catch (error) {
      throw error;
    }
  }
}
