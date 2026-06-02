import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../user/schema/user.schema';

import * as bcrypt from 'bcrypt';
import { CreateUserDto } from '../dto/create-user.dto';

@Injectable()
export class SignUpService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const { password, email, ...userData } = createUserDto;

    // Hash da senha antes de salvar
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new this.userModel({
      ...userData,
      // normalizado para casar com o lookup do SSO (sempre lowercase + trim)
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    });

    return newUser.save();
  }
}
