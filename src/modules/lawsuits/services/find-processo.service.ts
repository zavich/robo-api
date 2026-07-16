import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { AthenaQueryService } from './athena-query.service';
import { parseCnj } from '../utils/cnj.util';
import {
  buildProcessoResponse,
  CACHE_TTL_SECONDS,
  redisKeyForProcesso,
} from './cache-processo-to-redis.service';
import { FetchComunicacaoSpotService } from './fetch-comunicacao-spot.service';

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
    private readonly fetchComunicacaoSpotService: FetchComunicacaoSpotService,
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

    // Redis e comunicacao-spot são escritos pelo mesmo webhook, no mesmo
    // instante (WebhookService.execute) — sempre mais atuais que o Athena
    // (batch, que pode ficar bem atrasado) e, diferente dele, carregam
    // estrutura que o Athena não tem (ex.: anexos aninhados em cada
    // movimentação, colunas fixas não suportam isso). Por isso o Athena
    // nunca deve substituir um resultado real vindo de qualquer um dos
    // dois — antes comparava `enriquecido_em` e deixava o Athena "alcançar"
    // e sobrescrever o cache, descartando esse dado mais completo em
    // silêncio assim que o batch rodasse de novo.
    const cachedRaw = await this.redis.get(redisKey);
    const cached = this.parseCache(cachedRaw, numeroCnj);
    if (cached) {
      return cached;
    }

    // Sem cache no Redis (expirou — TTL de 30 dias — ou nunca foi setado).
    // Antes de cair pro Athena, tenta ler direto de comunicacao-spot: é
    // escrito no mesmo instante do webhook que o cache do Redis, só que sem
    // TTL — sobrevive ao cache expirar, e continua mais completo/atual que
    // o Athena pelo mesmo motivo do comentário acima.
    const fromSpot = await this.fromComunicacaoSpot(
      numeroCnj,
      trt,
      anoProcesso,
    );
    if (fromSpot) {
      await this.redis
        .set(redisKey, JSON.stringify(fromSpot), 'EX', CACHE_TTL_SECONDS)
        .catch(() => undefined);
      return fromSpot;
    }

    // Último recurso — nem Redis nem comunicacao-spot têm dado real ainda
    // pra esse processo.
    return this.queryAthena(numeroCnj, trt, anoProcesso);
  }

  private async fromComunicacaoSpot(
    numeroCnj: string,
    trt: string,
    anoProcesso: number,
  ) {
    const comunicacaoSpot =
      await this.fetchComunicacaoSpotService.execute(numeroCnj);

    // Um marcador "BUSCANDO" (sem `resposta.instancias` de verdade) não deve
    // substituir um resultado real que o Athena já tenha, ainda que atrasado.
    const hasRealData =
      (comunicacaoSpot?.resposta?.instancias?.length ?? 0) > 0;
    if (!comunicacaoSpot || !hasRealData) {
      return null;
    }

    return buildProcessoResponse(comunicacaoSpot, trt, anoProcesso);
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

  private async queryAthena(
    numeroCnj: string,
    trt: string,
    anoProcesso: number,
  ) {
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
