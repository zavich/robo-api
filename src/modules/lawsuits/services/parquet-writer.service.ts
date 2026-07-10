import { Injectable } from '@nestjs/common';
import { PassThrough } from 'stream';
import { ParquetSchema, ParquetWriter } from '@dsnp/parquetjs';
import type { SchemaDefinition } from '@dsnp/parquetjs';

// Helper genérico: monta um arquivo Parquet em memória a partir de um schema
// e uma lista de linhas — usado pra gravar direto nas tabelas do Athena
// (pje_processos/pje_instancias/pje_partes/pje_movimentacoes), sem passar
// por Glue/Spark.
@Injectable()
export class ParquetWriterService {
  async writeRows(
    schemaDefinition: SchemaDefinition,
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    const schema = new ParquetSchema(schemaDefinition);
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<void>((resolve, reject) => {
      passthrough.on('end', resolve);
      passthrough.on('error', reject);
    });

    // PassThrough satisfaz WriteStreamMinimal (write/end) em tempo de execução,
    // mas o tipo de retorno de `end()` diverge estruturalmente de fs.WriteStream.
    const writer = await ParquetWriter.openStream(
      schema,
      passthrough as unknown as Parameters<typeof ParquetWriter.openStream>[1],
    );
    for (const row of rows) {
      await writer.appendRow(row);
    }
    await writer.close();
    await finished;

    return Buffer.concat(chunks);
  }
}
