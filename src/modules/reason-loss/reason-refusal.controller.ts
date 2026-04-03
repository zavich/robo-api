import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CreateReasonLossService } from './services/create.service';
import {
  CreateReasonLossDTO,
  createReasonLossSchemaPipe,
} from './dto/create.dto';
import { ListReasonLossService } from './services/list.service';
import { ListReasonLossDto } from './dto/list-reason-loss.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { UpdateReasonLossService } from './services/update.service';
import { DeleteReasonLossService } from './services/delete.service';

@Controller('reason-loss')
@ApiBearerAuth()
@UseGuards(ApiKeyAuthGuard)
export class ReasonLossController {
  constructor(
    private readonly createReasonLossService: CreateReasonLossService,
    private readonly listReasonLossService: ListReasonLossService,
    private readonly updateReasonLossService: UpdateReasonLossService,
    private readonly deleteReasonLossService: DeleteReasonLossService,
  ) {}
  @Get()
  list(@Query() query: ListReasonLossDto) {
    return this.listReasonLossService.execute(query);
  }
  @Post()
  create(@Body(createReasonLossSchemaPipe) body: CreateReasonLossDTO) {
    return this.createReasonLossService.execute(body);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateReasonLossDTO>) {
    return this.updateReasonLossService.execute(id, body);
  }
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.deleteReasonLossService.execute(id);
  }
}
