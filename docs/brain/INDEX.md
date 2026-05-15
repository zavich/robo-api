# Brain Index

Este e o entrypoint canonico do repositorio para tasks assistidas por LLM.

Sempre leia este arquivo no inicio de uma task. Depois, carregue somente os documentos necessarios para a area investigada.

## Objetivo

O brain existe para reduzir custo de investigacao, evitar redescoberta recorrente e preservar conhecimento operacional sobre features, regras de dominio, arquitetura e decisoes.

Ele nao substitui o codigo. Ele orienta onde olhar, quais conceitos importam e quais riscos evitar.

## Ordem de leitura

1. Leia `project.md` para entender o contexto geral.
2. Use `task-router.md` quando a task tiver sintoma, area ou palavra-chave clara.
3. Consulte `architecture.md` quando a task envolver estrutura, modulos, dependencias ou fluxo entre camadas.
4. Consulte `features/README.md` para localizar mapas de feature existentes.
5. Se a task vier como sintoma operacional, consulte `debug-index.md`.
6. Leia somente os mapas em `features/` relacionados a task.
7. Consulte `runtime/` quando a task envolver Redis, BullMQ ou WebSocket.
8. Consulte `engineering/` quando a task envolver padroes de codigo, testes, schemas ou convencoes.
9. Consulte `decisions/` quando a task tocar uma decisao arquitetural ja registrada.

## Politica de carregamento

- Nao carregar todo o brain por padrao.
- Comecar pelo indice e pelos mapas mais proximos da task.
- Expandir a leitura conforme os imports, schemas, services e chamadas externas revelarem necessidade.
- Preferir evidencia local do repositorio a memoria ou suposicao.

## Politica de atualizacao

Atualize o brain quando a investigacao revelar conhecimento duravel, como:

- novo ponto de entrada de uma feature;
- relacao importante entre controller, service, schema, queue ou provider;
- teste que protege comportamento critico;
- regra de dominio que impacta aprovacao, rejeicao ou persistencia;
- risco operacional recorrente;
- decisao estrutural que futuras tasks devem respeitar.

Nao atualize o brain para detalhes efemeros, logs temporarios, valores de debug ou explicacoes linha a linha do codigo.

## Estrutura

- `project.md`: contexto geral, escopo e vocabulario do produto.
- `architecture.md`: visao de alto nivel da arquitetura do repositorio.
- `application-map.md`: indice operacional dos principais modulos, controllers e services.
- `coverage.md`: cobertura atual e lacunas controladas.
- `debug-index.md`: indice por sintoma para iniciar debug com poucos arquivos.
- `manifest.json`: indice machine-readable para roteamento.
- `task-router.md`: matriz de termos de task para documentos iniciais.
- `test-matrix.md`: matriz de testes e risco.
- `risk-map.md`: arquivos e areas de maior blast radius.
- `local-setup.md`: setup local para desenvolvimento.
- `features/`: mapas progressivos por feature.
- `workflows/`: roteiros para tarefas recorrentes.
- `decisions/`: registros de decisoes arquiteturais e operacionais.
- `runbooks/`: triagens operacionais curtas.
- `incidents/`: postmortems tecnicos de bugs e incidentes confirmados.
- `templates/`: templates para runbook, incidente e ADR.
- `engineering/`: convencoes praticas de implementacao, testes, banco e infraestrutura.
- `runtime/`: contratos runtime de Redis e WebSocket.
- `specs/`: contratos de especificacao (API, schemas MongoDB, filas, env vars, inter-service, auth).
- `generated/`: inventarios gerados do codigo.
- `CHANGELOG.md`: historico de evolucao do brain.

## Atalhos por tipo de task

- Processo, CRUD, stages, atividades, bulk: `features/process-management.md`.
- Filas, BullMQ, workers, validacao, solvencia, extracao: `features/process-queue.md`.
- Documentos, Vertex AI, insights, prompts: `features/document-insights.md`.
- Pipedrive, deals, notas, webhooks: `features/pipedrive-integration.md`.
- Login, JWT, usuarios, roles: `features/auth-users.md`.
- Notificacoes, Socket.io, real-time: `features/notifications.md`.
- Empresas, solvencia, CNDT, SharePoint, XLSX: `features/company-module.md`.
- Redis, cache, BullMQ: `runtime/redis.md`.
- WebSocket, gateway, rooms: `runtime/websocket.md`.
- MongoDB, schemas, Mongoose: `engineering/data-model.md`.
- Docker, ECS, deploy: `engineering/infrastructure.md`.
- Endpoints com shapes exatos: `specs/api-contracts.md`.
- Schemas MongoDB com campos: `specs/data-schemas.md`.
- Job payloads e step pipeline: `specs/queue-contracts.md`.
- Variaveis de ambiente: `specs/env-vars.md`.
- Comunicacao inter-servico, Pipedrive, Vertex AI: `specs/inter-service.md`.
- JWT, roles, guards: `specs/auth-system.md`.

## Atalhos por sintoma

- Job preso na fila ou nao processa: `workflows/debug-process-queue.md`.
- Validacao de solvencia incorreta: `debug-index.md`.
- Notificacao nao entregue: `debug-index.md`.
- Vertex AI retorna erro ou JSON invalido: `debug-index.md`.
- Pipedrive diverge do banco: `debug-index.md`.
- Auth falha ou token invalido: `debug-index.md`.
- Cron de revalidacao nao executa: `debug-index.md`.

## Protocolo de investigacao progressiva

1. Identifique termos da task e busque no codigo com `rg`.
2. Localize pontos de entrada: controller, service, worker ou cron.
3. Siga dependencias diretas: schemas, services, providers e utils.
4. Localize testes existentes da mesma area.
5. Se houver mapa de feature, compare o mapa com o que foi encontrado.
6. Atualize o mapa apenas com conhecimento confirmado.
7. Execute testes relevantes quando a task alterar comportamento.

## Criterio para criar um novo mapa de feature

Crie um novo arquivo em `features/` quando uma task revelar uma area funcional recorrente que ainda nao tem mapa proprio.

Use `features/_template.md` como base.
