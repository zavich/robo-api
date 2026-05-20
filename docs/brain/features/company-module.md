# Feature: Company Module

## Quando usar

Use este mapa quando a task envolver empresas, solvencia, CNDT, SharePoint, planilha XLSX ou dados do EmpresaQui.

## Pontos de entrada

- `src/modules/company/company.controller.ts`
- `POST /v1/company/upload-xml`: importa planilha solvencia do SharePoint.
- `GET /v1/company/:cnpj`: busca empresa por CNPJ.
- `GET /v1/company`: lista empresas paginada.
- `POST /v1/company/document?cnpj=&type=`: solicita documento (CNDT).
- `PUT /v1/company/:id`: atualiza empresa.
- `POST /v1/company/webhook`: callback do scraping (CNDT concluida).

## Arquivos relacionados

- `src/modules/company/company.module.ts`: modulo NestJS (providers internos, nao exportados).
- `src/modules/company/services/sharepoint.service.ts`: OAuth + download Graph API.
- `src/modules/company/services/upload-xlsx.service.ts`: parse XLSX e upsert empresas.
- `src/modules/company/services/document.service.ts`: solicita CNDT ao scraping.
- `src/modules/company/services/webhook.service.ts`: recebe callback CNDT.
- `src/modules/company/services/find-company.service.ts`: busca por CNPJ.
- `src/modules/company/services/list-company.service.ts`: listagem paginada.
- `src/modules/company/services/update.service.ts`: atualizacao generica.
- `src/modules/company/enum/status.enum.ts`: `StatusDocs { PENDING, CONCLUDED, ERROR }`.

## Fluxo: importacao de planilha solvencia

1. `POST /v1/company/upload-xml` (sem auth).
2. `UploadXLSXCompanyService` chama `SharePointService.downloadSolvenciaXLSX()`.
3. SharePoint autentica via OAuth 2.0 Client Credentials (Azure AD).
4. Download de `PLANILHA SOLVENCIA.xlsx` via Microsoft Graph API.
5. Parse com lib `xlsx`, le primeira sheet.
6. Para cada linha: extrai CNPJ, RECLAMADA, EXPLICACAO, SOLVENCIA, SCORE, FATURAMENTO.
7. Upsert por CNPJ: `findOne({ cnpj })` → create ou updateOne.
8. Retorna `{ total, criadas, atualizadas }`.

### Colunas mapeadas do XLSX

| Coluna XLSX | Campo Company |
|-------------|---------------|
| `CNPJ` | `cnpj` (stripped non-digits) |
| `RECLAMADA` / `RECLAMADA ` | `fantasyName` + `socialReason` |
| `EXPLICAÇÃO` | `reason` |
| `SOLVÊNCIA` | `specialRule` (lowercased/trimmed: `'solvente'` ou `'insolvente'`) |
| `SCORE` / `SCORE ` | `score` (numerico) |
| `FATURAMENTO` | `invoicing` (apenas na criacao) |

## Fluxo: solicitacao de CNDT

1. `POST /v1/company/document?cnpj=xxx&type=cndt` (auth: ApiKeyAuthGuard).
2. `DocumentService` seta `company.cndt.status = 'PENDING'`.
3. Chama `POST ${SCRAPING_BASE_URL}/receita-federal/cndt?cnpj={cnpj}` com `Authorization: Bearer {SCRAPING_API_KEY}`.
4. Scraping processa e chama de volta `POST /v1/company/webhook?type=cndt`.
5. `WebhookService` seta `company.cndt = { status: 'CONCLUDED', temp_link: payload.temp_link }`.
6. Em caso de erro no step 3: `company.cndt.status = 'ERROR'`.

## Fluxo: validacao de solvencia (via EmpresaQui)

Nao esta no company module — esta no `solvency-validation.service.ts` (step-2 da pipeline de processos). Mas afeta a entidade Company:

1. Job `solvency-validation` busca dados via `GET ${BASE_URL_EMPRESAQUI}/${API_KEY}/${cnpj}`.
2. Cria/atualiza Company com campos mapeados (razao, fantasia, socios, etc).
3. Determina solvencia baseado em `specialRule` e score.

## Conceitos

- **Solvencia**: classificacao da empresa como solvente/insolvente. Importada via planilha SharePoint ou calculada via EmpresaQui.
- **CNDT**: Certidao Negativa de Debitos Trabalhistas. Obtida via scraping do TST.
- **StatusDocs**: `PENDING` → `CONCLUDED` ou `ERROR`. Rastreia estado da solicitacao de documento.
- **Planilha Solvencia**: XLSX mantido no SharePoint pela equipe juridica com classificacao manual de empresas.

## Riscos e cuidados

- SharePoint OAuth nao cacheia token — cada upload faz nova autenticacao.
- Upload XLSX nao tem auth guard — endpoint aberto.
- `UpdateCompanyService` aceita `any` como updateData — sem validacao de campos.
- CNDT depende do scraping estar disponivel.
- Rate limit do EmpresaQui: retry apos 30s em HTTP 429 (recursivo, sem limite de tentativas).
