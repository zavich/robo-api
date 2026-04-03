import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { STAGEPROCESS } from '../interfaces/enum';

const changeStageSchema = z.object({
  processId: z.string().min(1, 'Process ID is required'),
  newStageId: z.number().min(1, 'Stage ID is required'),
  reason: z.string().optional().describe('Reason for stage change')
});

type ChangeStageDTO = z.infer<typeof changeStageSchema>;
class ChangeStageSchemaBody extends createZodDto(changeStageSchema) {}
const changeStageSchemaPipe = new ZodValidationPipe(changeStageSchema);

export { 
  ChangeStageDTO, 
  ChangeStageSchemaBody, 
  changeStageSchemaPipe 
};