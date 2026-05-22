import { Controller, Get } from '@nestjs/common';
import { Public } from '../authentication/decorators/public.decorator';
import { ListStepsService } from './services/list.service';

@Controller('steps')
export class StepsController {
  constructor(private readonly listStepsService: ListStepsService) {}

  @Get()
  @Public()
  findAll() {
    return this.listStepsService.execute();
  }
}
