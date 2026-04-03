import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const formPipedriveSchema = z
    .object({
      title: z.string().optional(),
      processNumber: z.string().optional(),
      executionNumber: z.string().optional(),
      duplicated: z.string().optional(),
      dl: z.string().optional(),
      firstDegree: z.string().optional(),
      secondDefendantResponsibility: z.string().optional(),
      defendants: z.string().optional(),
      analysis: z.string().optional(),
      sd: z.string().optional(),
      fgts: z.string().optional(),
      freeJustice: z.string().optional(),
      sucumbencia: z.string().optional(),
      jornadaOuCP: z.string().optional(),
      multaEmbargos: z.string().optional(),
      alvara: z.string().optional(),
      cessaoCredito: z.string().optional(),
      conclusion: z.string().optional(),
      minValueEstimate: z.string().optional(),
      prazo: z.string().optional(),
      abatimento: z.string().optional(),
      observacao: z.string().optional(),
      observacaoPreAnalise: z.string().optional(),
      value: z.number().optional(),
      calculoAutos: z.string().optional(),
      calculoAutosValue: z.string().optional(),
      calculoHomologado: z.string().optional(),
      execucaoProvisoria: z.string().optional(),
      stageLabel: z.string().optional(),
      activityType: z.string().optional(),
      activitySubject: z.string().optional(),
      activityDone: z.boolean().optional(),
    })
  .catchall(z.any());

const updateProcessSchema = z
  .object({
    number: z.string().min(1).optional(),
    title: z.string().optional(),
    stageLabel: z.string().optional(),
    formPipedrive: formPipedriveSchema.optional(),
  })
  .catchall(z.any()); // Aceita qualquer campo adicional
type UpdateProcessDTO = z.infer<typeof updateProcessSchema>;
class UpdateProcessSchemaBody extends createZodDto(updateProcessSchema) {}
const updateProcessSchemaPipe = new ZodValidationPipe(updateProcessSchema);

export { UpdateProcessDTO, UpdateProcessSchemaBody, updateProcessSchemaPipe };
