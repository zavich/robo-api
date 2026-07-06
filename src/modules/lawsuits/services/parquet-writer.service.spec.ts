import { ParquetReader } from '@dsnp/parquetjs';
import { ParquetWriterService } from './parquet-writer.service';

describe('ParquetWriterService', () => {
  it('escreve e lê de volta linhas com os tipos usados pelas tabelas pje_*', async () => {
    const service = new ParquetWriterService();

    const schema = {
      cnj_number: { type: 'UTF8' as const },
      instancia_id: { type: 'INT64' as const },
      valor_causa: { type: 'DOUBLE' as const, optional: true },
      arquivado: { type: 'BOOLEAN' as const, optional: true },
      data_distribuicao: { type: 'TIMESTAMP_MILLIS' as const, optional: true },
      data_mov: { type: 'DATE' as const, optional: true },
      texto: { type: 'UTF8' as const, optional: true },
    };

    const distribuicao = new Date('2026-01-15T10:00:00.000Z');
    const movimento = new Date('2026-02-01T00:00:00.000Z');

    const rows = [
      {
        cnj_number: '1000580-10.2023.5.02.0492',
        instancia_id: 123456,
        valor_causa: 1500.5,
        arquivado: false,
        data_distribuicao: distribuicao,
        data_mov: movimento,
        texto: null,
      },
    ];

    const buffer = await service.writeRows(schema, rows);
    expect(buffer.length).toBeGreaterThan(0);

    const reader = await ParquetReader.openBuffer(buffer);
    const cursor = reader.getCursor();
    const readRows: any[] = [];
    let row;
    while ((row = await cursor.next())) {
      readRows.push(row);
    }
    await reader.close();

    expect(readRows).toHaveLength(1);
    expect(readRows[0].cnj_number).toBe('1000580-10.2023.5.02.0492');
    expect(Number(readRows[0].instancia_id)).toBe(123456);
    expect(readRows[0].valor_causa).toBeCloseTo(1500.5);
    expect(readRows[0].arquivado).toBe(false);
    expect(new Date(readRows[0].data_distribuicao).toISOString()).toBe(
      distribuicao.toISOString(),
    );
  });

  it('não grava nada quando a lista de linhas está vazia (mas não deve ser chamado nesse caso)', async () => {
    const service = new ParquetWriterService();
    const schema = { cnj_number: { type: 'UTF8' as const } };

    const buffer = await service.writeRows(schema, []);
    // Um Parquet "vazio" ainda tem o footer/magic bytes — só confirmamos que não
    // lança erro. Quem decide não escrever tabelas sem linhas é o chamador
    // (SaveWebhookToAthenaService), não o writer em si.
    expect(buffer.length).toBeGreaterThan(0);
  });
});
