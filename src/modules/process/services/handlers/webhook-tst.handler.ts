import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { normalizeString } from 'src/utils/normalize-string';
import { Instancia, Root } from '../../interfaces/process.interface';
import { Process as ProcessEntity } from '../../schema/process.schema';

@Injectable()
export class WebhookTstHandler {
  private readonly logger = new Logger(WebhookTstHandler.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
  ) {}

  async handle(
    body: Root,
    findProcess: ProcessEntity & { _id: string | Types.ObjectId },
  ): Promise<void> {
    const oldMoviments = {
      tst:
        (findProcess?.instanciasAutos[0]?.movimentacoes as Record<string, unknown>[] | undefined)?.length === 0
          ? body.resposta?.instancias?.find(
              (instancia) => instancia.instancia === 'TST',
            )?.movimentacoes?.length
          : (findProcess?.instanciasAutos[0]?.movimentacoes as Record<string, unknown>[] | undefined)?.length,
    };

    await this.processModel.updateOne(
      { _id: findProcess._id },
      {
        sentToRecords: 'FOUND',
        instanciasAutos: body?.resposta?.instancias,
        oldMoviments,
      },
    );

    await this.extractRecordData(
      body.numero_processo,
      body?.resposta?.instancias[0],
    );
  }

  async extractRecordData(
    processNumber: string,
    instancias: Instancia,
  ): Promise<void> {
    try {
      const orgaoJulgador = instancias.orgao_julgador ?? null;
      const relator = instancias?.pessoa_relator ?? null;
      const partes = instancias.partes ?? [];

      const partesAtivas = partes
        ?.filter((parte) =>
          ['embargante', 'requerente', 'agravante', 'recorrente', 'autor'].some(
            (tipo) => normalizeString(parte?.tipo)?.includes(tipo),
          ),
        )
        ?.map((parte) => parte.nome);

      const partesPassivas = partes
        ?.filter((parte) =>
          ['embargado', 'agravado', 'requerido', 'recorrido', 'reu'].some(
            (tipo) => normalizeString(parte?.tipo)?.includes(tipo),
          ),
        )
        ?.map((parte) => parte.nome);

      const ativo = partesAtivas.length > 0 ? partesAtivas.join(', ') : null;
      const passivo =
        partesPassivas.length > 0 ? partesPassivas.join(', ') : null;

      const dataTransito =
        instancias?.movimentacoes
          ?.find((movimento) =>
            ['transitado em julgado']?.some((term) =>
              movimento.conteudo
                ?.normalize('NFD')
                ?.replace(/[\u0300-\u036f]/g, '')
                ?.toLocaleLowerCase()
                ?.includes(term),
            ),
          )
          ?.conteudo?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? null;

      const dataDistribuicao =
        instancias?.movimentacoes?.find((movimento) =>
          ['distribuído por sorteio', 'sorteio']?.some((term) =>
            movimento.conteudo
              ?.normalize('NFD')
              ?.replace(/[\u0300-\u036f]/g, '')
              ?.toLocaleLowerCase()
              ?.includes(term),
          ),
        )?.data ?? null;

      const movimentacoes = instancias?.movimentacoes ?? null;

      /* TODO: Alterar campos appellant e appellee para ativo e passivo */
      const autosData = {
        class: orgaoJulgador,
        relator,
        ativo,
        passivo,
        dateOfTransit: dataTransito,
        dateOfDistribution: dataDistribuicao,
        movements: movimentacoes,
      };

      await this.processModel.updateOne({ number: processNumber }, { autosData });
      this.logger.log('Finished extracting record data');
    } catch (error) {
      this.logger.error(`Erro ao extrair dados do processo: ${error.message}`);
    }
  }
}
