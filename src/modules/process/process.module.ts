import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AwsAppModule } from 'src/service/aws/aws.module';
import { BrapiService } from 'src/service/brapi/brapi.service';
import { NextStepsModule } from 'src/service/next-steps/next-steps.module';
import PipedriveService from 'src/service/pipedrive/pipedrive';
import { VertexModule } from 'src/service/vertex/vertex.module';
import { ProcessController } from './process.controller';
import { ProcessQueue } from './queues/process';
import { InitialPetitionService } from './queues/process/services/initial-petition.service';
import { InsertProcessService } from './queues/process/services/insert-process.service';
import { ProcessValidationService } from './queues/process/services/process-validation.service';
import { SolvencyValidationService } from './queues/process/services/solvency-validation.service';
import {
  ClaimedProcesses,
  ClaimedProcessesSchema,
} from './schema/claimed-processes.schema';
import { Company, CompanySchema } from './schema/company.schema';
import { Complainant, ComplainantSchema } from './schema/complainant.schema';
import {
  ProcessStatus,
  ProcessStatusSchema,
} from './schema/process-status.schema';
import { Process, ProcessSchema } from './schema/process.schema';
import { Step, StepSchema } from './schema/step.schema';
import { CreateProcessService } from './services/create-process.service';
import { FindProcessService } from './services/lawsuit/find-lawsuit';
import { MarkProcessAsReadService } from './services/mark-process-as-read.service';
import { LawsuitValidationService } from './services/run-lawsuit-validation.service';
import { WebhookPipedriveService } from './services/webhook-pipedrive.service';
import { WebhookService } from './services/webhook.service';

import { ScheduleModule } from '@nestjs/schedule';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { NotificationModule } from '../notification/notification.module';
import { User, UserSchema } from '../user/schema/user.schema';
import { LossRevalidationCron } from './crons/loss-revalidation.cron';
import { ExtractDocumentsInfoService } from './queues/process/services/extract-documents-info.service';
import {
  ProcessDecisions,
  ProcessDecisionsSchema,
} from './schema/process-decisions.schema';
import {
  ProcessOwner,
  ProcessOwnerSchema,
} from './schema/process-owner.schema';
import { Prompt, PromptSchema } from './schema/prompt.schema';
import { ChangeAssignedUserService } from './services/activity/change-assigned.service';
import { CompletedActivityService } from './services/activity/completed.service';
import { CreateActivityService } from './services/activity/create.service';
import { UpdateActivityNotesService } from './services/activity/update-notes.service';
import { BulkUpdateService } from './services/bulk-update.service';
import { ChangeStageService } from './services/change-stage.service';
import { ProcessCountersService } from './services/counters/process-counters.service';
import { DeleteInsightsDocumentService } from './services/documents/delete-insights.service';
import { FindInsightsService } from './services/documents/find-insights.service';
import { FindOneDocumentService } from './services/documents/find-one.service';
import { InsertExecutionService } from './services/insert-execution.service';
import { ListLawsuitService } from './services/lawsuit/list-lawsuit';
import { UpdateLawsuitService } from './services/lawsuit/update-lawsuit';
import { LossReasonsService } from './services/loss-reasons-service';
import { RemoveProvisionalLawsuitNumberService } from './services/remove-provisional-lawsuit-number.service';
import { RunListLawsuitsValidationService } from './services/run-list-lawsuits-validation.service';
import { SavedMovementsService } from './services/saved-movements.service';
import { MetricsService } from './services/metrics.service';
import { UploadXLSXService } from './services/upload-xlsx.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'process-queue',
    }),
    MongooseModule.forFeature([
      {
        name: Process.name,
        schema: ProcessSchema,
      },
      {
        name: ProcessStatus.name,
        schema: ProcessStatusSchema,
      },
      {
        name: Complainant.name,
        schema: ComplainantSchema,
      },
      {
        name: Company.name,
        schema: CompanySchema,
      },
      {
        name: Step.name,
        schema: StepSchema,
      },
      {
        name: ClaimedProcesses.name,
        schema: ClaimedProcessesSchema,
      },
      {
        name: Prompt.name,
        schema: PromptSchema,
      },
      {
        name: ProcessDecisions.name,
        schema: ProcessDecisionsSchema,
      },
      {
        name: ProcessOwner.name,
        schema: ProcessOwnerSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    AwsAppModule,
    VertexModule,
    NextStepsModule,
    ScheduleModule.forRoot(),
    NotificationModule,
  ],
  controllers: [ProcessController],
  providers: [
    CreateProcessService,
    WebhookService,
    FindProcessService,
    ProcessValidationService,
    SolvencyValidationService,
    InitialPetitionService,
    InsertProcessService,
    ProcessQueue,
    BrapiService,
    LawsuitValidationService,
    WebhookPipedriveService,
    PipedriveService,
    ListLawsuitService,
    RunListLawsuitsValidationService,
    NextStepsService,
    ExtractDocumentsInfoService,
    FindInsightsService,
    DeleteInsightsDocumentService,
    FindOneDocumentService,
    MarkProcessAsReadService,
    LossReasonsService,
    InsertExecutionService,
    ChangeStageService,
    RemoveProvisionalLawsuitNumberService,
    ProcessCountersService,
    SavedMovementsService,
    LossRevalidationCron,
    UpdateLawsuitService,
    BulkUpdateService,
    CreateActivityService,
    CompletedActivityService,
    ChangeAssignedUserService,
    UpdateActivityNotesService,
    MetricsService,
    UploadXLSXService,
  ],
})
export class ProcessModule {}
