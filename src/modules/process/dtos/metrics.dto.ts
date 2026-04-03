import { IsOptional, IsDateString } from 'class-validator';
import { TypeActivity } from '../interfaces/enum';

export class MetricsFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export interface ActivityTypeMetrics {
  /**
   * Quantidade total de processos para este tipo de atividade
   */
  total: number;

  /**
   * Quantidade de processos pendentes (não concluídos)
   */
  pending: number;

  /**
   * Quantidade de processos concluídos
   */
  completed: number;

  /**
   * Quantidade de processos aprovados
   */
  approved: number;

  /**
   * Quantidade de processos rejeitados
   */
  rejected: number;
}

export class ProcessMetricsResponseDto {
  /**
   * Quantidade total de processos
   */
  totalProcesses: number;

  /**
   * Métricas por tipo de atividade
   */
  processesByActivityType: {
    [key in TypeActivity]: ActivityTypeMetrics;
  };
}
