import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ObservationDocument } from './schema/observation.schema';
import { CreateObservationService } from './services/create.service';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { UpdateObservationService } from './services/update.service';
import { DeleteObservationService } from './services/delete.service';

@Controller('observations')
export class ObservationController {
  constructor(
    private readonly createObservationService: CreateObservationService,
    private readonly updateObservationService: UpdateObservationService,
    private readonly deleteObservationService: DeleteObservationService,
  ) {}

  @Post()
  @UseGuards(ApiKeyAuthGuard)
  create(@Body() createObservationDto: ObservationDocument) {
    return this.createObservationService.execute(createObservationDto);
  }
  @Patch(':id')
  @UseGuards(ApiKeyAuthGuard)
  update(@Body() updateObservationDto: ObservationDocument) {
    return this.updateObservationService.excute(
      updateObservationDto.id,
      updateObservationDto,
    );
  }
  @Delete(':id')
  @UseGuards(ApiKeyAuthGuard)
  delete(@Param('id') id: string) {
    return this.deleteObservationService.execute(id);
  }
}
