import { BadRequestException, Injectable } from '@nestjs/common';
import { AthenaQueryService } from './athena-query.service';

// Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO — grupos: sequencial, dígito
// verificador, ano, segmento do judiciário, tribunal, unidade de origem.
const NUMERO_CNJ_PATTERN =
  /^\d{7}-\d{2}\.(\d{4})\.\d\.(\d{2})\.\d{4}$/;

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
  constructor(private readonly athenaQueryService: AthenaQueryService) {}

  async execute(numeroCnj: string) {
    const match = NUMERO_CNJ_PATTERN.exec(numeroCnj);
    if (!match) {
      throw new BadRequestException('Número de processo inválido');
    }

    // pje_processos/pje_partes/pje_movimentacoes são particionadas por trt e
    // ano_processo. Sem filtrar por elas, o Athena varre todas as partições.
    // O número CNJ já contém os dois valores, então extraímos direto dele.
    const [, anoProcesso, tribunalCodigo] = match;
    const trt = `TRT${parseInt(tribunalCodigo, 10)}`;

    // Queries separadas (em paralelo) em vez de um join único: partes,
    // movimentações e instâncias não têm relação entre si, então juntar
    // todas de uma vez geraria produto cartesiano entre elas.
    const [processoRows, movimentacaoRows, instanciaRows] = await Promise.all([
      this.athenaQueryService.query<ProcessoRow>(`
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
        FROM pje_processos p
        LEFT JOIN pje_partes pt
          ON pt.cnj_number = p.cnj_number
          AND pt.trt = '${trt}'
          AND pt.ano_processo = ${anoProcesso}
        WHERE p.trt = '${trt}'
          AND p.ano_processo = ${anoProcesso}
          AND p.cnj_number = '${numeroCnj}'
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
