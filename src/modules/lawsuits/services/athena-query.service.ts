import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const POLL_INTERVAL_MS = 1000;
// Sem partição por cnj_number, a query faz table scan completo — pode levar
// bem mais que alguns segundos dependendo do tamanho da tabela.
const MAX_POLL_ATTEMPTS = 60;

@Injectable()
export class AthenaQueryService {
  private readonly logger = new Logger(AthenaQueryService.name);
  private readonly client: AthenaClient;
  private readonly database: string;
  private readonly outputLocation: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('ATHENA_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'ATHENA_SECRET_ACCESS_KEY',
    );

    this.client = new AthenaClient({
      region: this.configService.get<string>('ATHENA_REGION') || 'sa-east-1',
      // Sem accessKeyId/secretAccessKey nas envs, cai na credential chain
      // padrão da AWS SDK (role da task/instância), igual aos outros clients.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    this.database = this.configService.get<string>('ATHENA_DATABASE');
    this.outputLocation = this.configService.get<string>(
      'ATHENA_OUTPUT_LOCATION',
    );
  }

  async query<T = Record<string, string | null>>(sql: string): Promise<T[]> {
    const { QueryExecutionId } = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: { Database: this.database },
        ResultConfiguration: { OutputLocation: this.outputLocation },
      }),
    );

    if (!QueryExecutionId) {
      throw new Error('Athena não retornou um QueryExecutionId');
    }

    this.logger.log(`Athena query iniciada: ${QueryExecutionId}`);
    await this.waitForCompletion(QueryExecutionId);
    return this.fetchResults<T>(QueryExecutionId);
  }

  private async waitForCompletion(
    queryExecutionId: string,
    attempt = 0,
  ): Promise<void> {
    const { QueryExecution } = await this.client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }),
    );

    const state = QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) {
      return;
    }

    if (
      state === QueryExecutionState.FAILED ||
      state === QueryExecutionState.CANCELLED
    ) {
      const reason = QueryExecution?.Status?.StateChangeReason || state;
      this.logger.error(`Query do Athena falhou: ${reason}`);
      throw new Error(`Query do Athena falhou: ${reason}`);
    }

    if (attempt >= MAX_POLL_ATTEMPTS) {
      this.logger.error(
        `Timeout aguardando query do Athena (${queryExecutionId}), último estado: ${state}`,
      );
      throw new Error(
        `Timeout aguardando resultado da query no Athena (QueryExecutionId: ${queryExecutionId}, estado: ${state})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    return this.waitForCompletion(queryExecutionId, attempt + 1);
  }

  private async fetchResults<T>(queryExecutionId: string): Promise<T[]> {
    const { ResultSet } = await this.client.send(
      new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId }),
    );

    const rows = ResultSet?.Rows || [];
    if (rows.length === 0) {
      return [];
    }

    // A primeira linha do resultado do Athena é sempre o cabeçalho com os
    // nomes das colunas, não um registro de dados.
    const [headerRow, ...dataRows] = rows;
    const columns = (headerRow.Data || []).map((col) => col.VarCharValue || '');

    return dataRows.map((row) => {
      const record: Record<string, string | null> = {};
      (row.Data || []).forEach((cell, index) => {
        record[columns[index]] = cell.VarCharValue ?? null;
      });
      return record as T;
    });
  }
}
