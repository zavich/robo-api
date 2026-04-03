import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { User } from 'src/modules/user/schema/user.schema';

export enum NotificationTypeEnum {
  ACTIVITY = 'ACTIVITY',
  //   NEW_MESSAGE = 'NEW_MESSAGE',
  SYSTEM_NOTIFICATION = 'SYSTEM',
}

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({ default: false })
  read: boolean;

  @Prop({ enum: NotificationTypeEnum, required: true })
  type: NotificationTypeEnum;

  @Prop()
  redirectId?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
