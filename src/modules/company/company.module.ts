import { Module } from '@nestjs/common';

import { ListCompanyService } from './services/list-company.service';
import { CompanyController } from './company.controller';
import { Company, CompanySchema } from '../process/schema/company.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { FindCompanyService } from './services/find-company.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PassportModule } from '@nestjs/passport';
import { AuthenticationModule } from '../authentication/authentication.module';
import { UploadXLSXCompanyService } from './services/upload-xlsx.service';
import { WebhookService } from './services/webhook.service';
import { DocumentService } from './services/document.service';
import { UpdateCompanyService } from './services/update.service';
import { SharePointService } from './services/sharepoint.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Company.name,
        schema: CompanySchema,
      },
    ]),
    AuthenticationModule,
    ScheduleModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CompanyController],
  providers: [
    ListCompanyService,
    FindCompanyService,
    UploadXLSXCompanyService,
    WebhookService,
    DocumentService,
    UpdateCompanyService,
    SharePointService,
  ],
})
export class CompanyModule {}
