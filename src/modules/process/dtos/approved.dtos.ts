import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

const approvedProcessSchema = z.object({
  stage_id: z.number().min(1),
  form: z
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
    })
    .catchall(z.any())
    .optional(),
});
type ApprovedProcessDTO = z.infer<typeof approvedProcessSchema>;
class ApprovedProcessSchemaBody extends createZodDto(approvedProcessSchema) {}
const approvedProcessSchemaPipe = new ZodValidationPipe(approvedProcessSchema);

export {
  ApprovedProcessDTO,
  ApprovedProcessSchemaBody,
  approvedProcessSchemaPipe,
};
