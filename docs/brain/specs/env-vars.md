# Environment Variables

## Validadas por Zod (`src/config/zod/env.ts`)

| Variavel | Tipo | Obrigatorio | Default | Descricao |
|----------|------|-------------|---------|-----------|
| `DATABASE_URL` | string (url) | Sim | - | MongoDB connection string |
| `PORT` | number | Nao | 3333 | Porta do servidor |
| `BASE_URL_EMPRESAQUI` | string (url) | Sim | - | URL base da API EmpresaQui |
| `EMPRESAQUI_API_KEY` | string | Sim | - | API key do EmpresaQui |

## Usadas via process.env (sem validacao Zod)

| Variavel | Arquivo fonte | Tipo | Descricao |
|----------|--------------|------|-----------|
| `JWT_SECRET_KEY` | ConfigService | string | Secret para assinar JWTs |
| `REDIS_URL` | redis config | string | URL conexao Redis |
| `SCRAPING_BASE_URL` | `insert-process.service.ts` | string | URL do scraping-fetch-robo (ex: `https://scraping-api.juri.capital`) |
| `PIPEDRIVE_PROSOLUTTI_URL` | `pipedrive.ts` | string | URL base Pipedrive API (ex: `https://api.pipedrive.com`) |
| `PIPEDRIVE_PROSOLUTTI_TOKEN` | `pipedrive.ts` | string | Token API Pipedrive |
| `GOOGLE_PROJECT_ID` | `vertex-AI.service.ts` | string | GCP project ID para Vertex AI |
| `GOOGLE_VERTEX_LOCATION` | `vertex-AI.service.ts` | string | GCP region (ex: `us-central1`) |
| `GOOGLE_VERTEX_MODEL` | `vertex-AI.service.ts` | string | Nome do modelo Vertex AI (ex: `gemini-1.5-flash`) |
| `GOOGLE_CLIENT_EMAIL` | `vertex-AI.service.ts` | string | Email service account GCP |
| `GOOGLE_CLIENT_ID` | `vertex-AI.service.ts` | string | Client ID service account GCP |
| `GOOGLE_PRIVATE_KEY` | `vertex-AI.service.ts` | string | Private key GCP (com `\\n` literais) |
| `AWS_S3_BUCKET_NAME` | `aws-s3.service.ts` | string | Bucket S3 para documentos |
| `AWS_S3_REGION` | `aws-s3.service.ts` | string | Regiao AWS S3 (default: `sa-east-1`) |
| `AWS_REGION` | Secrets Manager client | string | Regiao AWS para Secrets Manager |
| `AWS_SECRET_ID` | Secrets Manager | string | ID do secret (default: `juri-api-prd`) |
| `NODE_ENV` | task-definition.json | string | `'local'` / `'production'` |
| `ENVIRONMENT` | main.ts | string | Se `'production'`, Bull Board desabilitado |
| `BRAPI_URL` | `brapi.service.ts` | string | URL base da API BRAPI (ex: `https://brapi.dev/api`) |
| `BRAPI_TOKEN` | `brapi.service.ts` | string | Token de autenticacao BRAPI |
| `SCRAPING_API_KEY` | `document.service.ts` | string | API key para autenticar chamadas ao scraping-fetch-robo (header `Authorization: Bearer`) |
| `MICROSOFT_SITE_ID` | `sharepoint.service.ts` | string | SharePoint site ID (Graph API) |
| `MICROSOFT_DRIVE_ID` | `sharepoint.service.ts` | string | Document library drive ID |
| `MICROSOFT_ITEM_ID` | `sharepoint.service.ts` | string | Item ID do arquivo PLANILHA SOLVENCIA no drive |
| `MICROSOFT_CLIENT_ID` | `sharepoint.service.ts` | string | Azure AD App Registration Client ID |
| `MICROSOFT_SECRET_VALUE` | `sharepoint.service.ts` | string | Azure AD App Registration Client Secret |
| `MICROSOFT_DIRECTORY_ID` | `sharepoint.service.ts` | string | Azure AD Tenant (Directory) ID |

## Notas

- Apenas 4 variaveis tem validacao Zod. As demais 16+ sao lidas diretamente de `process.env`.
- `GOOGLE_PRIVATE_KEY` precisa ter `\\n` literais que sao substituidos por `\n` reais no runtime.
- `AWS_SECRET_ID` default `juri-api-prd` carrega secrets do Secrets Manager em producao.
