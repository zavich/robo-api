# Inter-Service Communication

## robo-api → scraping-fetch-robo

Base URL: `process.env.SCRAPING_BASE_URL`

### POST ${SCRAPING_BASE_URL}/processos/:processNumber

- **Arquivo**: `insert-process.service.ts` (`fetchProcessExtract`)
- **Quando**: novo processo inserido no sistema
- **Body**: `{ documents: boolean, priority: boolean }`
  - `documents=true, priority=true` → com documentos
  - `documents=false, priority=true` → apenas movimentacoes
- **Response 422**: salva `async_id` do body como `process.integrationId`
- **Sucesso**: atualiza processStatus para `PROCESSING_WITH_DOCUMENTS` ou `PROCESSING_WITH_MOVIMENTS`

### POST ${SCRAPING_BASE_URL}/processos/:processNumber (TST)

- **Arquivo**: `process-validation.service.ts`
- **Body**: `{ origem: 'TST' }`
- **Quando**: processo foi "sent to records" (TST)

---

## scraping-fetch-robo → robo-api (webhook callback)

### POST /v1/process/webhook

**Body** (interface `Root`):
```typescript
{
  id: number,
  created_at: { date: string, timezone_type: number, timezone: string },
  enviar_callback: string,
  link_api: string,
  numero_processo: string,
  resposta: {
    numero_unico: string,
    origem: string,
    instancias: Instancia[],
    message: string
  },
  status: string,          // 'NAO_ENCONTRADO' | 'ERRO' | sucesso
  motivo_erro: any,
  status_callback: any,
  tipo: string,
  opcoes: { autos?: boolean, ... },
  tribunal: {
    sigla: string,         // ex: 'TRT15', 'TST'
    nome: string,
    busca_processo: number,
    busca_nome: number,
    busca_oab: number,
    busca_documento: number,
    disponivel_autos: number,
    documentos_publicos: number
  },
  valor: string,
  event: string,
  uuid: string
}
```

**Instancia** (dentro de `resposta.instancias[]`):
```typescript
{
  id: number, url: string, sistema: string,
  instancia: string,       // 'PRIMEIRO_GRAU' | 'SEGUNDO_GRAU' | 'TST'
  extra_instancia: string,
  classe: string,          // ex: 'Reclamação Trabalhista' — usado para detectar PROVISIONAL_EXECUTION
  area: string,
  data_distribuicao: string,
  orgao_julgador: string,
  pessoa_relator: string,
  valor_causa: string,
  arquivado: boolean,
  segredo: boolean,
  partes: [{ id, tipo, nome, principal, polo, documento: {tipo, numero}, advogado_de, oabs }],
  movimentacoes: [{ id, data, conteudo, idUnicoDocumento? }],
  audiencias: [],
  documentos_restritos: [{ posicao_id, titulo, descricao, data, tipo, unique_name, suffix, size, is_backblaze, is_on_s3, paginas, ... }],
  documentos: [{ title, temp_link, uniqueName, date }]
}
```

---

## robo-api → EmpresaQui (dados de empresa)

- **URL**: `GET ${BASE_URL_EMPRESAQUI}/${EMPRESAQUI_API_KEY}/${cnpj}`
- **Arquivo**: `solvency-validation.service.ts`
- **Quando**: job `solvency-validation` (step-2)
- **Rate limit**: retry apos 30s em HTTP 429 (recursivo)
- **Mapeamento de campos**:

| Campo EmpresaQui | Campo Company |
|------------------|---------------|
| `razao` | `name` |
| `cnpj` | `cnpj` |
| `email` | `email` |
| `fantasia` | `fantasyName` |
| `natureza_juridica` | `legalNature` |
| `situacao_cadastral` | `registrationStatus` |
| `regime_tributario` | `taxRegime` |
| `socios` | `partners` (array extraido de chaves numericas) |
| `capital_social` | `socialCapital` |
| `faturamento` | `invoicing` |
| `porte` | `porte` |

---

## robo-api → Pipedrive

Autenticacao: `api_token` como query param (v1) ou header `X-API-Token` (v2).

### Chamadas API

| Metodo | Endpoint | Uso |
|--------|----------|-----|
| PUT | `/v1/deals/:dealId` | Atualizar stage_id, status, title, custom fields |
| POST | `/v1/notes` | Criar nota no deal |
| PUT | `/v1/notes/:noteId` | Atualizar nota |
| GET | `/api/v2/activities?deal_id=&limit=100` | Buscar atividades do deal (header `X-API-Token`) |
| PATCH | `/api/v2/activities/:activityId` | Atualizar atividade (header `X-API-Token`) |

### Custom fields Pipedrive

| Hash | Descricao |
|------|-----------|
| `de696f45d23c41be28892dcf4d83383852946429` | Flag aprovado (valor: `'Sim'`) |
| `fc5f94cbf972eacef5050f1f53b4f88f1770f87c` | Numero da execucao |

### Stage mapping (Pipedrive stageId → interno)

| stageId | Stage | Esteira |
|---------|-------|---------|
| 781 | PRE_ANALISE | Reclamantes Outbound |
| 779 | PRE_ANALISE | Reclamantes Inbound |
| 777 | PRE_ANALISE | Ticket Alto |
| 802 | PRE_ANALISE | Advogados Parceiros |
| 769 | ANALISE | Reclamantes Outbound |
| 762 | ANALISE | Reclamantes Inbound |
| 755 | ANALISE | Ticket Alto |
| 787 | ANALISE | Advogados Parceiros |
| 770 | CALCULO | Reclamantes Outbound |
| 763 | CALCULO | Reclamantes Inbound |
| 756 | CALCULO | Ticket Alto |
| 797 | CALCULO | Advogados Parceiros |

### Default stage IDs para ChangeStage (processos com dealId)

| Stage | Default stageId |
|-------|----------------|
| PRE_ANALISE | 802 |
| ANALISE | 787 |
| CALCULO | 797 |

---

## robo-api → Vertex AI (Gemini)

- **Library**: `@google-cloud/vertexai`
- **Model**: `process.env.GOOGLE_VERTEX_MODEL` (ex: `gemini-1.5-flash`)
- **Config**: `{ temperature: 0.1, topP: 0.95, responseMimeType: 'application/json' }`

### Input

```typescript
{
  contents: [{
    role: 'user',
    parts: [
      { file_data: { mime_type: 'application/pdf', file_uri: string } },  // signed S3 URL (1h expiry)
      { text: string }  // prompt do DB (collection prompts)
    ]
  }]
}
```

### Output

JSON parseado de `response.candidates[0].content.parts[0].text`. Shape depende do prompt.

### Retry

- Ate 3 retries para HTTP 429 (rate limit)
- Backoff: `attempt * 3000ms`
- Cooldown de 3s apos sucesso

### Prompts por tipo de documento

| Metodo | Prompt Source (DB type) | Matched by |
|--------|----------------------|------------|
| `getPromptProcessoPrincipal()` | `PeticaoInicial` | `/.*peticao.*inicial.*/i` regex no titulo |
| `getPromptExecucaoProvisoria()` | Hardcoded inline | Classe PROVISIONAL_EXECUTION |
| `getPromptDocumentAlvara()` | `Alvara` | - |
| `getPromptDocumentAcordo()` | `HomologacaoDeAcordo` | - |
| `getPromtDocumentParcelamento916Alvara()` | `AcordoEParcelamento` | - |
| `getPromptDocumentHomologacao()` | `Homologacao` | - |
| `getPromptDocumentPlanilhaCalculo()` | `PlanilhaCalculo` | `/.*planilha.*de.*calculo.*/i` regex |
| `getPromptDocumentAcordao()` | `Acordao` | - |
| `getPromptDocumentAcordaoMerito()` | `AcordaoMerito` | - |
| `getPromptDocumentAdmissibilityDecision()` | `AdmissibilidadeRR` | - |
| `getPromptDocumentRecursoDeRevista()` | `RecursoDeRevista` | - |
| `getPromptDocumentParametersDecisao()` | `Decisao` | - |
| `getPromptDocumentParametersSentencaMerito()` | `SentencaMerito` | - |
| `getPromptDocumentParametersSentencaED()` | `SentencaED` | - |
| `getPromptDocumentParametersSentencaEE()` | `SentencaEE` | - |
| `getPromptIdentifyProvisionalExecution()` | Hardcoded inline | Prefixo CumPrSe/ExProvAS |
| `getPromptDocumentGarantia()` | `Garantia` | - |

---

## robo-api → BRAPI (taxa Selic)

- **Arquivo**: `src/service/brapi/brapi.service.ts`
- **Modulo**: registrado como provider em `ProcessModule` (sem modulo proprio)

### GET ${BRAPI_URL}/prime-rate

- **Query params** (automaticos via axios): `token=${BRAPI_TOKEN}`, `country=brazil`
- **Response esperada**:
  ```json
  { "prime-rate": [{ "value": 10.75, ... }] }
  ```
- **Retorno**: `number` — taxa Selic como float
- **Erro**: se valor falsy (0, undefined, NaN), throws `Error('Error getting current Selic rate')`
- **Status atual**: provider declarado mas metodo `getCurrentSelicRate()` NAO e chamado por nenhum service no codebase atual. Provisionado para uso futuro (provavelmente step-9 `simple-calc`).

---

## robo-api → Microsoft SharePoint (planilha solvencia)

- **Arquivo**: `src/modules/company/services/sharepoint.service.ts`
- **Proposito**: baixar PLANILHA SOLVENCIA.xlsx do SharePoint via Microsoft Graph API

### Auth: OAuth 2.0 Client Credentials

```
POST https://login.microsoftonline.com/{MICROSOFT_DIRECTORY_ID}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id={MICROSOFT_CLIENT_ID}
client_secret={MICROSOFT_SECRET_VALUE}
scope=https://graph.microsoft.com/.default
grant_type=client_credentials
```

Retorna `access_token`. Sem cache — novo token a cada chamada.

### Download do arquivo

```
GET https://graph.microsoft.com/v1.0/sites/{MICROSOFT_SITE_ID}/drives/{MICROSOFT_DRIVE_ID}/items/{MICROSOFT_ITEM_ID}/content
Authorization: Bearer {token}
ResponseType: arraybuffer
```

Retorna `Buffer` com conteudo binario do XLSX.

### Quem chama

`UploadXLSXCompanyService.execute()` → triggered por `POST /v1/company/upload-xml`.

---

## robo-api → scraping-fetch-robo (CNDT)

### POST ${SCRAPING_BASE_URL}/receita-federal/cndt

- **Arquivo**: `src/modules/company/services/document.service.ts`
- **Quando**: `POST /v1/company/document` com `type === 'cndt'`
- **Query**: `cnpj={cnpj}`
- **Auth**: `Authorization: Bearer {SCRAPING_API_KEY}`
- **Side effect pre-call**: seta `company.cndt.status = 'PENDING'`
- **Side effect on error**: seta `company.cndt.status = 'ERROR'`
- **Callback**: resultado volta via `POST /v1/company/webhook` (scraping chama de volta)

---

## Pipedrive → robo-api (webhook)

### POST /v1/process/webhook-pipedrive/

```typescript
{
  num_processo: string,   // numero CNJ
  deal_id: number,        // Pipedrive deal ID
  stage_id: number        // Pipedrive stage ID
}
```

---

## robo-api → painel-robo

Nenhuma comunicacao HTTP direta. Painel-robo consome robo-api via REST + WebSocket.

---

## WebSocket (robo-api → painel-robo)

- **Namespace**: default
- **CORS**: `origin: '*'`
- **Handshake**: `{ auth: { userId: string } }`
- **Rooms**: client adicionado a room com nome = userId

### Eventos emitidos (server → client)

#### `notification`

- **Trigger**: `CreateNotificationsService.execute()` (activity atribuida ou completada)
- **Scope**: `server.to(userId)` (room per-user)
- **Payload**:
  ```typescript
  {
    _id: ObjectId,
    title: string,
    description: string,
    userId: ObjectId,
    read: boolean,
    type: 'ACTIVITY' | 'SYSTEM',
    redirectId?: string,    // numero do processo
    createdAt: Date,
    updatedAt: Date
  }
  ```

**Nota**: nao ha eventos client → server definidos (nenhum `@SubscribeMessage`). Gateway e puramente push.

---

## Cron Jobs

### LossRevalidationCron

- **Schedule**: `EVERY_DAY_AT_MIDNIGHT` (`0 0 * * *`)
- **O que faz**:
  1. Busca processos com `situation = 'LOSS'` E ultimo history com `rejection_reason` IN `['ANÁLISE – RISCO DE TESE', 'ANÁLISE – RISCO DE PRAZO']`
  2. Para cada: reset `processStatus.step` para `step-1`, re-submit para scraping
  3. Retorna `{ message, total, success, errors, results }`
