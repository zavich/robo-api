import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AthenaQueryService } from './athena-query.service';
import { parseCnj } from '../utils/cnj.util';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';

interface ProcessoRow {
  cnj_number: string;
  status_coleta: string | null;
  motivo_erro: string | null;
  enriquecido_em: string | null;
  origem: string | null;
  num_instancias: string | null;
  trt: string | null;
  ano_processo: string | null;
  parte_instancia_id: string | null;
  parte_id: string | null;
  parte_tipo: string | null;
  parte_polo: string | null;
  parte_nome: string | null;
  parte_doc_tipo: string | null;
  parte_doc_numero: string | null;
  parte_advogado_de: string | null;
  parte_principal: string | null;
}

interface MovimentacaoRow {
  instancia_id: string;
  movimentacao_id: string;
  data_mov: string;
  conteudo: string | null;
  pje_doc_id: string | null;
  texto: string | null;
  unique_name_documento: string | null;
}

interface InstanciaRow {
  instancia_id: string;
  grau: string | null;
  classe: string | null;
  area: string | null;
  orgao_julgador: string | null;
  data_distribuicao: string | null;
  valor_causa: string | null;
  arquivado: string | null;
  data_arquivamento: string | null;
  assunto_principal: string | null;
  assunto_principal_codigo: string | null;
  assuntos_json: string | null;
  segredo: string | null;
  sistema: string | null;
  last_update_time: string | null;
}

@Injectable()
export class FindProcessoService {
  private readonly logger = new Logger(FindProcessoService.name);

  constructor(
    private readonly athenaQueryService: AthenaQueryService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async execute(numeroCnj: string) {
    const parsed = parseCnj(numeroCnj);
    if (!parsed) {
      throw new BadRequestException('Número de processo inválido');
    }

    const { trt, anoProcesso } = parsed;
    const redisKey = redisKeyForProcesso(numeroCnj);

    // Redis é atualizado direto no ato do webhook (sempre a versão mais
    // recente); o Athena só reflete o que foi processado em batch e pode
    // estar bem mais atrasado. Consulta os dois em paralelo: se o Athena já
    // alcançou (ou superou) a data do cache, ele virou a versão mais atual —
    // apaga o cache (não serve mais pra nada) e devolve o Athena. Enquanto o
    // Athena não alcançar, o cache continua sendo a resposta.
    const [cachedRaw, athenaResult] = await Promise.all([
      this.redis.get(redisKey),
      this.queryAthena(numeroCnj, trt, anoProcesso),
    ]);

    const cached = this.parseCache(cachedRaw, numeroCnj);
    if (cached) {
      if (this.athenaCaughtUp(athenaResult, cached.enriquecidoEm)) {
        await this.redis.del(redisKey).catch(() => undefined);
        return athenaResult;
      }
      return cached;
    }

    return athenaResult;
  }

  private parseCache(raw: string | null, numeroCnj: string): any | null {
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      this.logger.warn(
        `Cache inválido no Redis pra ${numeroCnj}, ignorando: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  // Timestamp do Athena e do cache vêm no mesmo formato hoje
  // ("YYYY-MM-DD HH:mm:ss.SSS", sem timezone — UTC implícito), mas trata os
  // dois do mesmo jeito por segurança: sem "Z"/offset explícito, o
  // `new Date(...)` do V8 interpreta como horário LOCAL, não UTC — o que
  // desalinha a comparação se rodar num processo Node fora de UTC.
  private parseUtcTimestamp(value: string): Date {
    return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  }

  private athenaCaughtUp(
    athenaResult: { enriquecidoEm?: string | null } | null,
    cachedEnriquecidoEm: unknown,
  ): boolean {
    if (!athenaResult?.enriquecidoEm || !cachedEnriquecidoEm) return false;

    const athenaDate = this.parseUtcTimestamp(athenaResult.enriquecidoEm);
    const cachedDate = this.parseUtcTimestamp(cachedEnriquecidoEm as string);

    if (Number.isNaN(athenaDate.getTime()) || Number.isNaN(cachedDate.getTime())) {
      return false;
    }

    return athenaDate.getTime() >= cachedDate.getTime();
  }

  private async queryAthena(numeroCnj: string, trt: string, anoProcesso: number) {
    // Queries separadas (em paralelo) em vez de um join único: partes,
    // movimentações e instâncias não têm relação entre si, então juntar
    // todas de uma vez geraria produto cartesiano entre elas.
    const [processoRows, movimentacaoRows, instanciaRows] = await Promise.all([
      this.athenaQueryService.query<ProcessoRow>(`
        WITH processo_priorizado AS (
          -- pje_processos é append-only (cada webhook grava uma linha nova) —
          -- pode ter mais de uma linha pro mesmo cnj_number. Prioriza a mais
          -- recente com status_coleta = 'SUCESSO'; sem nenhuma SUCESSO, cai
          -- pra mais recente de qualquer status.
          SELECT *
          FROM pje_processos
          WHERE trt = '${trt}'
            AND ano_processo = ${anoProcesso}
            AND cnj_number = '${numeroCnj}'
          ORDER BY
            CASE WHEN status_coleta = 'SUCESSO' THEN 0 ELSE 1 END,
            enriquecido_em DESC
          LIMIT 1
        ),
        partes_sem_duplicata AS (
          -- pje_partes também é append-only — dedupe pra não listar a mesma
          -- parte várias vezes quando o processo foi sincronizado mais de uma vez.
          SELECT DISTINCT
            instancia_id, parte_id, tipo, polo, nome,
            doc_tipo, doc_numero, advogado_de, principal
          FROM pje_partes
          WHERE trt = '${trt}'
            AND ano_processo = ${anoProcesso}
            AND cnj_number = '${numeroCnj}'
        )
        SELECT
          p.cnj_number AS cnj_number,
          p.status_coleta AS status_coleta,
          p.motivo_erro AS motivo_erro,
          p.enriquecido_em AS enriquecido_em,
          p.origem AS origem,
          p.num_instancias AS num_instancias,
          p.trt AS trt,
          p.ano_processo AS ano_processo,
          pt.instancia_id AS parte_instancia_id,
          pt.parte_id AS parte_id,
          pt.tipo AS parte_tipo,
          pt.polo AS parte_polo,
          pt.nome AS parte_nome,
          pt.doc_tipo AS parte_doc_tipo,
          pt.doc_numero AS parte_doc_numero,
          pt.advogado_de AS parte_advogado_de,
          pt.principal AS parte_principal
        FROM processo_priorizado p
        LEFT JOIN partes_sem_duplicata pt
          ON true
      `),
      this.athenaQueryService.query<MovimentacaoRow>(`
        SELECT
          instancia_id,
          movimentacao_id,
          data_mov,
          conteudo,
          pje_doc_id,
          texto,
          unique_name_documento
        FROM pje_movimentacoes
        WHERE trt = '${trt}'
          AND ano_processo = ${anoProcesso}
          AND cnj_number = '${numeroCnj}'
        ORDER BY data_mov
      `),
      this.athenaQueryService.query<InstanciaRow>(`
        SELECT
          instancia_id,
          grau,
          classe,
          area,
          orgao_julgador,
          data_distribuicao,
          valor_causa,
          arquivado,
          data_arquivamento,
          assunto_principal,
          assunto_principal_codigo,
          assuntos_json,
          segredo,
          sistema,
          last_update_time
        FROM pje_instancias
        WHERE trt = '${trt}'
          AND ano_processo = ${anoProcesso}
          AND cnj_number = '${numeroCnj}'
        ORDER BY data_distribuicao
      `),
    ]);

    if (processoRows.length === 0) {
      return null;
    }

    const [first] = processoRows;

    const grauPorInstanciaId = new Map(
      instanciaRows.map((row) => [row.instancia_id, row.grau]),
    );

    return {
      cnjNumber: first.cnj_number,
      statusColeta: first.status_coleta,
      motivoErro: first.motivo_erro,
      enriquecidoEm: first.enriquecido_em,
      origem: first.origem,
      numInstancias: first.num_instancias,
      trt: first.trt,
      anoProcesso: first.ano_processo,
      partes: processoRows
        .filter((row) => row.parte_nome)
        .map((row) => ({
          parteId: row.parte_id,
          instanciaId: row.parte_instancia_id,
          tipo: row.parte_tipo,
          polo: row.parte_polo,
          nome: row.parte_nome,
          docTipo: row.parte_doc_tipo,
          docNumero: row.parte_doc_numero,
          advogadoDe: row.parte_advogado_de,
          principal: row.parte_principal,
        })),
      movimentacoes: movimentacaoRows.map((row) => ({
        instanciaId: row.instancia_id,
        grau: grauPorInstanciaId.get(row.instancia_id) ?? null,
        movimentacaoId: row.movimentacao_id,
        data: row.data_mov,
        conteudo: row.conteudo,
        documentoId: row.pje_doc_id,
        texto: row.texto,
        nomeDocumento: row.unique_name_documento,
      })),
      instancias: instanciaRows.map((row) => ({
        instanciaId: row.instancia_id,
        grau: row.grau,
        classe: row.classe,
        area: row.area,
        orgaoJulgador: row.orgao_julgador,
        dataDistribuicao: row.data_distribuicao,
        valorCausa: row.valor_causa,
        arquivado: row.arquivado,
        dataArquivamento: row.data_arquivamento,
        assuntoPrincipal: row.assunto_principal,
        assuntoPrincipalCodigo: row.assunto_principal_codigo,
        assuntosJson: row.assuntos_json,
        segredo: row.segredo,
        sistema: row.sistema,
        lastUpdateTime: row.last_update_time,
      })),
    };
  }
}
