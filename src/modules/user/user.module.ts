import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schema/user.schema';
import { UpdateUserService } from './services/update.service';
import { UsersController } from './user.controller';
import { ListUserService } from './services/list.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [UpdateUserService, ListUserService],
  exports: [],
})
export class UserModule {}
