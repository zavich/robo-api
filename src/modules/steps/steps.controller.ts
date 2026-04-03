import { Controller, Get } from '@nestjs/common';
import { ListStepsService } from './services/list.service';

@Controller('steps')
export class StepsController {
  constructor(private readonly listStepsService: ListStepsService) {}

  @Get()
  findAll() {
    return this.listStepsService.execute();
  }
}
