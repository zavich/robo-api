import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../schema/user.schema';
import { UpdateUserSchemaBody } from '../dto/update.dto';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UpdateUserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  /**
   * Deleta várias notificações pelo array de IDs
   */
  async execute(id: string, body: UpdateUserSchemaBody) {
    try {
      const user = await this.userModel.findById(id);
      if (!user) {
        throw new BadRequestException('Usuário não encontrado');
      }

      if (body.email) {
        user.email = body.email;
      }

      if (body.name) {
        user.name = body.name;
      }

      if (body.password) {
        user.password = await bcrypt.hash(body.password, 10);
      }
      const updated = await this.userModel.findByIdAndUpdate(id, user, {
        new: true,
      });
      return updated;
    } catch (error) {
      throw error;
    }
  }
}
