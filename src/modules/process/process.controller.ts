import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import {
  ChangeStageSchemaBody,
  changeStageSchemaPipe,
} from './dtos/change-stage.dto';
import { CreateProcessDTO, createProcessSchemaPipe } from './dtos/create.dto';
import {
  InsertExecutionSchemaBody,
  insertExecutionSchemaPipe,
} from './dtos/insert-execution.dto';
import { ListProcessFiltersDto } from './dtos/list-process-filters.dto';
import { Root } from './interfaces/process.interface';
import { CreateProcessService } from './services/create-process.service';
import { DeleteInsightsDocumentService } from './services/documents/delete-insights.service';
import { FindInsightsService } from './services/documents/find-insights.service';
import { FindOneDocumentService } from './services/documents/find-one.service';
import { InsertExecutionService } from './services/insert-execution.service';
import { FindProcessService } from './services/lawsuit/find-lawsuit';
import { ListLawsuitService } from './services/lawsuit/list-lawsuit';
import { MarkProcessAsReadService } from './services/mark-process-as-read.service';

import { FileInterceptor } from '@nestjs/platform-express';
import axios from 'axios';
import { AwsServices } from 'src/service/aws/aws.service';
import {
  CompletedActivityDTO,
  completedActivitySchemaPipe,
} from './dtos/activity/completed.dto';
import {
  CreateActivitySchemaBody,
  createActivitySchemaPipe,
} from './dtos/activity/create.dto';
import {
  UpdateActivityNotesSchemaBody,
  updateActivityNotesSchemaPipe,
} from './dtos/activity/update-notes.dto';
import {
  BulkUpdateSchemaBody,
  bulkUpdateSchemaPipe,
} from './dtos/bulk-update.dto';
import { LossReasonsFiltersDto } from './dtos/loss-reasons-filters.dto';
import {
  MetricsFiltersDto,
  ProcessMetricsResponseDto,
} from './dtos/metrics.dto';
import {
  UpdateProcessSchemaBody,
  updateProcessSchemaPipe,
} from './dtos/update-lawsuit.dto';
import { ChangeAssignedUserService } from './services/activity/change-assigned.service';
import { CompletedActivityService } from './services/activity/completed.service';
import { CreateActivityService } from './services/activity/create.service';
import { UpdateActivityNotesService } from './services/activity/update-notes.service';
import { BulkUpdateService } from './services/bulk-update.service';
import { ChangeStageService } from './services/change-stage.service';
import { ProcessCountersService } from './services/counters/process-counters.service';
import { UpdateLawsuitService } from './services/lawsuit/update-lawsuit';
import {
  LossReasonCategory,
  LossReasonsService,
  RejectionReasonOption,
} from './services/loss-reasons-service';
import { MetricsService } from './services/metrics.service';
import { RemoveProvisionalLawsuitNumberService } from './services/remove-provisional-lawsuit-number.service';
import { LawsuitValidationService } from './services/run-lawsuit-validation.service';
import { RunListLawsuitsValidationService } from './services/run-list-lawsuits-validation.service';
import { SavedMovementsService } from './services/saved-movements.service';
import { UploadXLSXService } from './services/upload-xlsx.service';
import { WebhookPipedriveService } from './services/webhook-pipedrive.service';
import { WebhookService } from './services/webhook.service';

@ApiTags('Process')
@Controller('process')
export class ProcessController {
  constructor(
    private readonly createProcessService: CreateProcessService,
    private readonly webhookService: WebhookService,
    private readonly findProcessService: FindProcessService,
    private readonly lawsuitValidationService: LawsuitValidationService,
    private readonly webhookPipedriveService: WebhookPipedriveService,
    private readonly listLawsuitService: ListLawsuitService,
    private readonly runListLawsuitsValidationService: RunListLawsuitsValidationService,
    private readonly findInsightsService: FindInsightsService,
    private readonly deleteInsightsDocumentService: DeleteInsightsDocumentService,
    private readonly findOneDocumentService: FindOneDocumentService,
    private readonly lossReasonsService: LossReasonsService,
    private readonly insertExecutionService: InsertExecutionService,
    private readonly changeStageService: ChangeStageService,
    private readonly removeProvisionalLawsuitNumberService: RemoveProvisionalLawsuitNumberService,
    private readonly markProcessAsReadService: MarkProcessAsReadService,
    private readonly processCountersService: ProcessCountersService,
    private readonly savedMovementsService: SavedMovementsService,
    private readonly updateLawsuitService: UpdateLawsuitService,
    private readonly bulkUpdateService: BulkUpdateService,
    private readonly createActivityService: CreateActivityService,
    private readonly completedActivityService: CompletedActivityService,
    private readonly changeAssignedUserService: ChangeAssignedUserService,
    private readonly updateActivityNotesService: UpdateActivityNotesService,
    private readonly metricsService: MetricsService,
    private readonly awsService: AwsServices,
    private readonly uploadXLSXService: UploadXLSXService,
  ) {}
  @Patch(':id/mark-as-read')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async markAsRead(@Param('id') id: string, @Res() res: Response) {
    try {
      const user = (res.req as any).user;
      if (!user || !user._id) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
      }
      const process = await this.markProcessAsReadService.execute(id, user._id);
      return res.json({ message: 'Processo marcado como lido', process });
    } catch (error) {
      return res.status(error.status || 400).json({ message: error.message });
    }
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async process(
    @Body(createProcessSchemaPipe)
    createProcessService: CreateProcessDTO,
  ) {
    try {
      return await this.createProcessService.execute(createProcessService);
    } catch (error) {
      throw error;
    }
  }
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: Root) {
    try {
      await this.webhookService.execute(body);
    } catch (error) {
      throw error;
    }
  }

  @Get('counters')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async getProcessCounters(
    @Query() query: ListProcessFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const counters = await this.processCountersService.execute(query);
      return res.json(counters);
    } catch (error) {
      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error.message,
      });
    }
  }

  @Get('')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async listProcess(
    @Query() query: ListProcessFiltersDto,
    @Res() res: Response,
  ) {
    try {
      const user = (res.req as any).user;
      const userId = user?._id;

      const result = await this.listLawsuitService.execute(query, userId);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error.message,
      });
    }
  }

  @Get('reasons-loss')
  async getLossRejectionReasons(
    @Query() filters?: LossReasonsFiltersDto,
  ): Promise<RejectionReasonOption[]> {
    try {
      if (filters?.search) {
        return await this.lossReasonsService.search(filters.search);
      }
      return await this.lossReasonsService.execute();
    } catch (error) {
      throw error;
    }
  }

  @Get('reasons-loss/categories')
  async getLossReasonsByCategory(
    @Query() filters?: LossReasonsFiltersDto,
  ): Promise<LossReasonCategory[]> {
    try {
      const categories = this.lossReasonsService.getByCategory();

      if (filters?.category) {
        return categories.filter((cat) => cat.category === filters.category);
      }

      if (filters?.search) {
        return categories
          .map((category) => ({
            ...category,
            reasons: category.reasons.filter(
              (reason) =>
                reason.key
                  .toLowerCase()
                  .includes(filters.search!.toLowerCase()) ||
                reason.label
                  .toLowerCase()
                  .includes(filters.search!.toLowerCase()),
            ),
          }))
          .filter((category) => category.reasons.length > 0);
      }

      return categories;
    } catch (error) {
      throw error;
    }
  }

  @Get('/metrics')
  async getAllProcessMetrics(
    @Query() filters: MetricsFiltersDto,
  ): Promise<ProcessMetricsResponseDto> {
    return await this.metricsService.execute(filters);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async findProcess(@Param('id') id: string, @Res() res: Response) {
    try {
      const user = (res.req as any).user;
      const userId = user?._id;

      const result = await this.findProcessService.execute(id, userId);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error.message,
      });
    }
  }

  @Post(':id/insert-execution')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async insertExecution(
    @Param('id') id: string,
    @Body(insertExecutionSchemaPipe) body: InsertExecutionSchemaBody,
  ) {
    const result = await this.insertExecutionService.execute(
      id,
      body.lawsuitExecution,
      body.pipedriveFieldValue,
    );
    return result;
  }

  @Post('run-lawsuit-validation')
  async runLawsuitValidation(
    @Body() body: { number: string; step: string; isAll: boolean },
  ) {
    try {
      return await this.lawsuitValidationService.execute(
        body.number,
        body.step,
        body.isAll,
      );
    } catch (error) {
      throw error;
    }
  }

  @Post('insert-lawsuit-manual')
  async lawsuitManual(@Body() body: any[]) {
    try {
      const promises = body.map((item) =>
        this.webhookPipedriveService.execute(item),
      );
      return await Promise.all(promises);
    } catch (error) {
      throw error;
    }
  }
  @Post('webhook-pipedrive/')
  async webhookPipedrive(@Body() body: any) {
    try {
      return await this.webhookPipedriveService.execute(body);
    } catch (error) {
      throw error;
    }
  }
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  @Post('run-documents-insights')
  async runDocumentsInsights(
    @Body() body: { number: string; documents: string[]; prompt: string },
  ) {
    try {
      await this.findInsightsService.execute(
        body.number,
        body.documents,
        body.prompt,
      );
      return { message: 'Processamento iniciado' };
    } catch (error) {
      throw error;
    }
  }
  @UseGuards(ApiKeyAuthGuard)
  @Post('run-lawsuits')
  async runLawsuitsList(
    @Body()
    body: {
      lawsuits: string[];
      documents?: boolean;
      name?: string;
      log?: string;
      errorReason?: string;
    },
  ) {
    try {
      await this.runListLawsuitsValidationService.execute(
        body.lawsuits,
        body.documents,
        body.name,
        body.log,
        body.errorReason,
      );
      return { message: 'Processamento iniciado' };
    } catch (error) {
      throw error;
    }
  }

  @Get(':number/documents/:documentId')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async getDocument(
    @Param('number') number: string,
    @Param('documentId') documentId: number,
  ) {
    try {
      return await this.findOneDocumentService.execute(number, documentId);
    } catch (error) {
      throw error;
    }
  }
  @Delete(':number/documents/:documentId')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async deleteDocumentInsights(
    @Param('number') number: string,
    @Param('documentId') documentId: number,
  ) {
    try {
      return await this.deleteInsightsDocumentService.execute(
        number,
        documentId,
      );
    } catch (error) {
      throw error;
    }
  }

  @Post('change-stage')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async changeStage(
    @Body(changeStageSchemaPipe) body: ChangeStageSchemaBody,
    @Res() res: Response,
  ) {
    const user = (res.req as any).user;

    try {
      const result = await this.changeStageService.execute(body, user._id);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }

  @Get('stages/available')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async getAvailableStages(@Query('processId') processId?: string) {
    try {
      const stages =
        await this.changeStageService.getAvailableStages(processId);
      return stages;
    } catch (error) {
      throw error;
    }
  }

  @Delete(':id/remove-provisional-lawsuit-number')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async removeProvisionalLawsuitNumber(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const result =
        await this.removeProvisionalLawsuitNumberService.execute(id);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }

  @Post(':number/movements/mark-viewed')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async markMovementsAsViewed(
    @Param('number') processNumber: string,
    @Query('instance') instance: 'PRIMEIRO_GRAU' | 'SEGUNDO_GRAU',
  ) {
    return await this.savedMovementsService.execute(processNumber, instance);
  }

  @Patch(':number/update')
  async updateLawsuit(
    @Param('number') number: string,
    @Body(updateProcessSchemaPipe) body: UpdateProcessSchemaBody,
  ) {
    return await this.updateLawsuitService.execute(number, body);
  }

  @Post('bulk-update')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async bulkUpdate(
    @Body(bulkUpdateSchemaPipe) body: BulkUpdateSchemaBody,
    @Res() res: Response,
  ) {
    try {
      const user = (res.req as any).user;
      if (!user || !user._id) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
      }

      const result = await this.bulkUpdateService.execute(body, user._id);
      return res.json(result);
    } catch (error) {
      return res.status(error.status || 400).json({
        message: error.message,
      });
    }
  }

  @Post('activity')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async createActivity(
    @Body(createActivitySchemaPipe) dto: CreateActivitySchemaBody,
    @Res() res: Response,
  ) {
    const user = (res.req as any).user;

    const result = await this.createActivityService.execute(user._id, dto);
    return res.status(200).json(result);
  }

  @Patch(':processId/activity/completed')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async completeActivity(
    @Param('processId') processId: string,
    @Body(completedActivitySchemaPipe) body: CompletedActivityDTO,
    @Res() res: Response,
  ) {
    const user = (res.req as any).user;

    const result = await this.completedActivityService.execute(
      processId,
      user._id,
      body,
    );

    return res.status(200).json(result);
  }
  @Patch(':processId/activity/assigned')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async updateAssignedUser(
    @Param('processId') processId: string,
    @Body(createActivitySchemaPipe) body: CreateActivitySchemaBody,
  ) {
    return this.changeAssignedUserService.execute(processId, body);
  }

  @Patch(':processId/activity/notes')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async updateActivityNotes(
    @Param('processId') processId: string,
    @Body(updateActivityNotesSchemaPipe) body: UpdateActivityNotesSchemaBody,
  ) {
    return this.updateActivityNotesService.execute(processId, body);
  }

  @Post('upload-xml')
  @UseInterceptors(FileInterceptor('file'))
  async atualizarSolvencia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo foi enviado.');
    }

    return this.uploadXLSXService.execute(file.buffer);
  }
  @Get('/documents/*')
  @ApiBearerAuth()
  @UseGuards(ApiKeyAuthGuard)
  async getFile(@Request() req, @Res({ passthrough: true }) res: Response) {
    try {
      const key = decodeURIComponent(req.params[0]);

      const signedUrl = await this.awsService.getSignedUrlS3(key);

      const response = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
      });

      return new StreamableFile(response.data);
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro ao obter arquivo.');
    }
  }
}
