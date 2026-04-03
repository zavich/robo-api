import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import {
  CreatePromptSchemaBody,
  createPromptSchemaPipe,
} from './dtos/create.dto';
import { ListPromptDto } from './dtos/list-prompt.dto';
import { CreatePromptService } from './services/create.service';
import { ListPromptService } from './services/list-prompt.service';
import { UpdatePromptService } from './services/update.service';
import { DeletePromptService } from './services/delete.service';

@Controller('prompts')
@UseGuards(ApiKeyAuthGuard)
export class PromptController {
  constructor(
    private readonly promptService: ListPromptService,
    private readonly createPromptService: CreatePromptService,
    private readonly updatePromptService: UpdatePromptService,
    private readonly deletePromptService: DeletePromptService,
  ) {}

  @Get()
  async listPrompts(@Query() query: ListPromptDto, @Res() res: Response) {
    const result = await this.promptService.execute(query);
    return res.status(HttpStatus.OK).json(result);
  }
  @Post()
  async createPrompt(
    @Body(createPromptSchemaPipe) body: CreatePromptSchemaBody,
  ) {
    return await this.createPromptService.execute(body);
  }
  @Put('/:id')
  async updatePrompt(
    @Param('id') id: string,
    @Body()
    body: Partial<CreatePromptSchemaBody>,
  ) {
    return await this.updatePromptService.execute(id, body);
  }
  @Delete('/:id')
  async deletePrompt(@Param('id') id: string) {
    return await this.deletePromptService.execute(id);
  }
}
