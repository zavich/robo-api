# Brain Coverage

## Cobertura forte

- Process module: CRUD, stages, atividades, bulk, filas, crons.
- Queue workers: insert, validation, solvency, extraction, petition.
- Authentication: JWT, API Key, login, signup.
- Notifications: WebSocket gateway, CRUD, tipos.
- Arquitectura: stack, modulos, fluxo de dados.

## Cobertura parcial

- Pipedrive: notas mapeadas, webhooks e custom fields a detalhar.
- Company: CRUD mapeado, SharePoint e upload XLSX a detalhar.
- Vertex AI: service mapeado, fluxo completo de extracao a detalhar.
- Metricas: service existe, mas logica interna nao detalhada.

## Lacunas controladas

- BraAPI: integracao nao mapeada (criar feature quando virar foco).
- Next-steps service: nao detalhado.
- SharePoint integration: nao detalhada.
- Testes: suite basica existe (Jest), mas cobertura e baixa.

## Politica de expansao

Expanda o brain quando houver conhecimento duravel e reutilizavel. Nao expanda para logs temporarios, payloads sensiveis ou explicacao linha a linha.
