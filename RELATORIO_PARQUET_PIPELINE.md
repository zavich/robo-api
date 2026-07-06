# Pipeline PJE Enriquecimento — Parquet + Athena

**Data:** 2026-06-18  
**Bucket:** `s3://main-prd-lawsuit-frame` (sa-east-1)  
**Banco Glue Catalog:** `pje_enriquecimento`

---

## 1. Contexto

O processo de enriquecimento coleta dados de processos trabalhistas via API PJE (comunicaapi.pje.jus.br) usando máquinas EC2 spot. Cada processo coletado gera um arquivo JSON no S3 em `comunicacao-spot/TRT{N}/{ano}/{cnj}.json`. Com ~93.665 arquivos acumulados, surgiu a necessidade de servir esses dados como SQL relacional para análise.

---

## 2. Decisões de arquitetura

### 2.1 Estratégia de armazenamento
Avaliamos três alternativas:

| Alt | Abordagem | Escolha? |
|-----|-----------|----------|
| 1 | RDS PostgreSQL (carga direta) | Não — custo alto, sem elasticidade para queries analíticas |
| 2 | **Parquet + Athena (serverless)** | **Sim** |
| 3 | Redshift | Não — overhead operacional para o volume atual |

**Parquet + Athena** foi escolhido por: custo quase zero em repouso, queries SQL ad-hoc sem servidor, integração nativa com o S3 já existente, e partition pruning que reduz dados varridos.

### 2.2 Modelagem relacional
Os JSONs têm estrutura aninhada (`resposta.instancias[].partes[].advogados`). O modelo normalizado resultante tem 4 tabelas:

```
pje_processos       — 1 linha por CNJ (chave: cnj_number + trt + ano_processo)
pje_instancias      — 1–4 linhas por CNJ (explode instancias[])
pje_partes          — N linhas por instância (inclui advogados via campo advogado_de)
pje_movimentacoes   — até 716 linhas por instância (tabela mais volumosa)
```

Todas particionadas por `(trt, ano_processo)` para que queries filtradas por tribunal/ano varram apenas os arquivos relevantes.

---

## 3. Implementação

### 3.1 Glue ETL Job (`glue/pje_etl_job.py`)

Job PySpark que lê os JSONs e escreve os 4 Parquets. Decisões técnicas relevantes:

- **Schema explícito**: definido em código Python (`StructType`). Elimina a fase de inferência de schema (Stage 0 problemático), tornando a leitura direta.
- **`maxPartitionBytes=32MB`**: força Spark a criar partições menores, evitando OOM nos executores com arquivos grandes (maior arquivo: 2,1 MB em TRT3/2014).
- **`F.expr("filter(...)")`**: higher-order function via SQL expression — executa no JVM sem cruzar a fronteira Python/JVM. A sintaxe `F.filter(col, "x -> ...")` com string lambda não é suportada em PySpark 3.3 (Glue 4.0).
- **`partitionOverwriteMode=dynamic`**: reprocessamento incremental sobrescreve apenas as partições presentes no DataFrame, sem apagar as demais.
- **Algoritmo v2 do S3 committer**: reduz overhead de finalização de escrita Parquet no S3.

**Configurações do job:**
- Workers: 5 × G.1X (4 vCPU, 16 GB RAM cada)
- Glue 4.0 (Spark 3.3, Python 3.10)
- Timeout: 180 min
- Speculation: `spark.speculation=true` via `--conf`

### 3.2 Tabelas Glue Data Catalog (`glue/athena_tables.sql`)

4 `CREATE EXTERNAL TABLE` apontando para os prefixos Parquet. Partições registradas via `MSCK REPAIR TABLE` após o ETL.

### 3.3 Migração S3 us-east-1 → sa-east-1

Os arquivos de enriquecimento estavam em `comunicacao-spot/` num bucket em **us-east-1**, gerando tráfego cross-region com todo o compute em sa-east-1. Migração realizada:

1. Criado bucket `main-prd-lawsuit-frame` em sa-east-1
2. Copiados apenas os 93.665 JSONs do prefix `comunicacao-spot/` (~1,5 GB)
3. Bucket intermediário deletado (191.563 versões + delete markers removidos via boto3)
4. Todas as referências no código atualizadas: `cloudformation.yaml`, `orchestrate.py`, `local_dlq_processor.py`, `test_trt3_waf.py`, testes

---

## 4. Incidentes durante a implementação

### 4.1 Stage 0 travando nos últimos 3% (4 tentativas)
**Causa:** Spark inferia schema varrendo todos os 93k arquivos em 10.000 tasks. As últimas ~37 tasks (partições com arquivos de TRT9/TRT12 grandes) travavam em GC/OOM.  
**Solução:** Schema explícito no código Python + `maxPartitionBytes=32MB`.

### 4.2 `F.filter()` com string lambda não funciona em PySpark 3.3
**Causa:** `F.filter("col", "x -> x.campo = true")` trata o segundo argumento como callable Python — `inspect.signature("string")` lança `TypeError`.  
**Solução:** `F.expr("filter(col, x -> x.campo = true)")` — executa via Spark SQL no JVM.

### 4.3 MSCK REPAIR TABLE falhando no job Glue
**Causa:** Tabelas não existiam no Glue Catalog quando o job rodou pela primeira vez.  
**Solução:** `CREATE EXTERNAL TABLE` executado via Athena antes do MSCK REPAIR.

### 4.4 `rb --force` não remove bucket versionado
**Causa:** `aws s3 rb --force` deleta versões correntes mas deixa versões anteriores + delete markers.  
**Solução:** Script boto3 paginando `list_object_versions` e deletando em lotes de 1.000.

---

## 5. Resultado final

| Métrica | Valor |
|---------|-------|
| Arquivos JSON de origem | 93.665 |
| TRTs cobertos | 23 |
| Processos únicos | 93.665 |
| Instâncias totais | 116.213 |
| Movimentações totais | **11.907.402** |
| Arquivos Parquet gerados | ~303.255 |
| Custo de query típica (filtro por TRT+ano) | < 2 MB varridos |

**Distribuição de instâncias por processo:**

| Instâncias | Processos |
|-----------|-----------|
| NAO_ENCONTRADO (−1) | 2.290 |
| 1 (apenas 1º grau) | 64.247 |
| 2 (recurso ordinário) | 27.128 |

**Exemplo de query e custo:**
```sql
-- Advogados mais ativos no TRT5 em 2026
-- Dados varridos: 1 MB (vs ~1,5 GB total)
SELECT nome, COUNT(DISTINCT cnj_number) AS processos
FROM pje_enriquecimento.pje_partes
WHERE trt = 'TRT5' AND ano_processo = 2026 AND tipo = 'ADVOGADO'
GROUP BY nome ORDER BY processos DESC LIMIT 20;
```

---

## 6. Pendências

### 6.1 ETL integrado à pipeline de enriquecimento (prioritário)
**Problema atual:** O ETL é batch — processa todos os JSONs acumulados de uma vez (horas de execução). Qualquer novo processo coletado só fica disponível no Athena após reprocessar tudo.

**Arquitetura proposta (event-driven):**
```
collector.py → save_to_s3() → SNS/SQS → Lambda "etl-incremental"
                                              ↓
                                   parse JSON → append Parquet via
                                   Delta Lake ou Apache Iceberg
                                   (suporte a upsert em Parquet)
```

**Alternativa mais simples (sem Delta/Iceberg):**
- Após cada `save_to_s3()` no collector, publicar o `cnj_number + s3_key` numa fila SQS
- Uma Lambda consome a fila, lê o JSON, escreve 4 registros Parquet individuais em prefixos temporários
- Glue job leve (agendado a cada hora) consolida os temporários nas partições definitivas e roda `MSCK REPAIR`

### 6.2 Reprocessamento incremental do ETL atual
O job Glue suporta `--PARTITION_FILTER "trt=TRT5/ano_processo=2026"` para reprocessar apenas uma partição. Usar isso para atualizar dados de TRTs específicos sem rodar o ETL completo.

### 6.3 Fix watchtower no `collector.py`
Parâmetro `log_group_name` → `log_group` (quebra o log estruturado no CloudWatch).

### 6.4 DLQ — 7.714 mensagens pendentes
Reprocessamento da dead-letter queue (`pje-spot-coleta-dlq`) ainda pendente. TRT18 (39% da DLQ) requer estratégia de IP não-EC2.

### 6.5 EC2 downsize
`pje-collector-worker` pode ser reduzido para `c6i.large` — workload pesado encerrado.

### 6.6 Bug #4 em `create_normalizacao.py`
`regexp_replace` com nesting incorreto — pendente.

### 6.7 Validação de qualidade dos dados
- Processos com `num_instancias = -1` (2.290 NAO_ENCONTRADO): verificar se devem ser excluídos das tabelas derivadas ou mantidos como registro de ausência
- Campos `instancia_id`, `parte_id`, `movimentacao_id` vêm como string no JSON original — cast para BIGINT pode gerar nulls para valores não numéricos

---

## 7. Como consumir os dados

Ver instruções detalhadas na seção de consumo (AWS Athena, boto3, JDBC).
