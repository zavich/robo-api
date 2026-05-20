# Feature: Document Insights

## Quando usar

Use este mapa quando a task envolver analise de documentos com AI, extracao de insights, prompts ou Vertex AI.

## Status do mapeamento

- Estado: parcial
- Ultima area investigada: services de documentos e Vertex AI
- Principais lacunas: fluxo completo de extracao nao mapeado

## Pontos de entrada

- `src/modules/process/services/documents/find-insights.service.ts`
- `src/modules/process/services/documents/find-one.service.ts`
- `src/modules/process/services/documents/delete-insights.service.ts`
- `src/service/vertex/vertex-AI.service.ts`
- `src/modules/prompts/prompt.controller.ts`

## Fluxo resumido

1. Documento PDF e armazenado no S3 pelo scraping service.
2. Usuario solicita extracao de insights via frontend.
3. Queue worker chama Vertex AI com prompt especifico por tipo de documento.
4. Vertex AI (Gemini) analisa o PDF e retorna JSON estruturado.
5. Resultado e persistido como insight no documento do processo.
6. Frontend exibe insight com status (PENDING, PROCESSING, COMPLETED, ERROR).

## Conceitos

- Prompt: template de instrucao para Vertex AI por tipo de documento.
- PromptType: PeticaoInicial, Homologacao, Sentenca, Acordao, Alvara, etc.
- Vertex AI: Google Cloud AI com modelo Gemini para analise de documentos.
- Retry com backoff exponencial para rate limit (429).

## Riscos e cuidados

- Vertex AI pode retornar JSON invalido; parsing deve ser robusto.
- Rate limit (429) requer retry com backoff.
- PDF no S3 pode ter URL expirada.
- Custo de API Vertex AI proporcional ao tamanho do documento.

## Pendencias de mapeamento

- Detalhar cada PromptType e seu conteudo.
- Mapear fluxo de retry e fallback.
