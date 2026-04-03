import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AwsServices } from './aws.service';

@Module({
  imports: [ConfigModule],
  providers: [AwsServices],
  exports: [AwsServices],
})
export class AwsAppModule {}
