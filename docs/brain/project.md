# Project Context

## Estado

Documento de contexto geral apos scan inicial. Detalhes por dominio ficam nos mapas em `features/` e `engineering/`.

## Produto

`robo-api` (prosolutti-api) e uma API NestJS/TypeScript para gestao de processos judiciais, empresas, integracoes externas, analises por AI, notificacoes e sincronizacao com CRM. Serve como backend do painel-robo.

## Diretrizes de conhecimento

- O codigo e a fonte primaria de verdade.
- Este documento deve registrar apenas contexto amplo e duravel.
- Regras especificas devem ficar nos mapas de feature em `features/`.
- Decisoes estruturais devem ficar em `decisions/`.

## Vocabulario

- Processo: entidade central com numero, classe, partes, movimentos, documentos, insights e deal Pipedrive.
- Empresa: entidade representando reclamada com CNPJ, razao social, solvencia e score.
- Analise: avaliacao automatizada de processo (aprovacao, rejeicao, solvencia).
- Solvencia: validacao de viabilidade financeira da empresa reclamada.
- Deal: negocio no Pipedrive vinculado ao processo.
- Atividade: tarefa criada por usuario, atribuida a advogado, com status de conclusao.
- Notificacao: alerta enviado via WebSocket para usuarios (atividades, sistema).
- Documento: arquivo PDF extraido do processo judicial.
- Insight: resultado de analise AI (Vertex AI/Gemini) sobre documento.
- Prompt: template de prompt para analise AI por tipo de documento.
- Esteira/Step: estagio de workflow (PRE_ANALISE, ANALISE, CALCULO).
- Movimento: evento processual com data e descricao.
- Situation: estado do processo (PENDING, LOSS, APPROVED).
- Reclamante/Complainant: parte autora do processo.
- Motivo de perda/ReasonLoss: razao de rejeicao do processo.
- Observacao: nota livre sobre processo.

## Dominios principais

- Processos judiciais: CRUD, stages, validacao, solvencia, extracao de documentos.
- Filas de processamento: BullMQ workers para insercao, validacao, solvencia e extracao.
- Empresas: gestao, webhooks, upload XLSX, SharePoint.
- CRM/Pipedrive: notas, custom fields, stages, webhooks.
- Documentos/AI: analise com Vertex AI (Gemini), prompts por tipo de documento.
- Notificacoes: WebSocket gateway, CRUD, tipos (ACTIVITY, SYSTEM_NOTIFICATION).
- Auth/Usuarios: JWT, API Key, roles (ADMIN, ADVOGADO).
- Infraestrutura: MongoDB, Redis, BullMQ, AWS (S3, SES, SNS, Secrets Manager).

## Pendencias de mapeamento

- Aprofundar integracao SharePoint quando houver task especifica.
- Mapear fluxo de next-steps service quando virar foco.
- Detalhar integracao BraAPI quando houver task.
