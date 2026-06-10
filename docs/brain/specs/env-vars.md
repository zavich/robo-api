# Environment Variables

## Validadas por Zod (`src/config/zod/env.ts`)

| Variavel | Tipo | Obrigatorio | Default | Descricao |
|----------|------|-------------|---------|-----------|
| `DATABASE_URL` | string (url) | Sim | - | MongoDB connection string |
| `PORT` | number | Nao | 3333 | Porta do servidor |
| `BASE_URL_EMPRESAQUI` | string (url) | Sim | - | URL base da API EmpresaQui |
| `EMPRESAQUI_API_KEY` | string | Sim | - | API key do EmpresaQui |
| `NODE_ENV` | string | Nao | - | `'local'` relaxa cookie/CORS e carrega `.env`; qualquer outro = produção |
| `ENVIRONMENT` | string | Nao | - | Se `!= 'production'`, habilita o Bull Board |
| `JWT_PRIVATE_KEY_ROBO_API` | string (PEM) | SSO | - | Chave **privada** RS256 que assina os tokens (`iss=painel-robo`) |
| `JWT_PUBLIC_KEY_ROBO_API` | string (PEM) | SSO | - | Chave **pública** própria; valida tokens emitidos por esta API (`iss=painel-robo`) |
| `JWT_PUBLIC_KEY_JURI_API` | string (PEM) | SSO | - | Chave **pública** da juri-api; valida tokens dela (`iss=api.juri.capital`) |
| `AUTH_COOKIE_DOMAIN` | string | Nao | `.juri.capital` (prod) | Sobrescreve o domínio do cookie `auth_token` (ex.: SSO local) |
| `CORS_ORIGINS` | string (csv) | Nao | lista base | Sobrescreve a lista base de origens CORS |
| `CORS_EXTRA_ORIGINS` | string (csv) | Nao | - | Origens extras de CORS; **só aplicadas em `NODE_ENV=local`** |
| `AUTH_STRICT_ROLE_AUDIT` | string | Nao | - | `'true'` aborta o bootstrap se houver roles desconhecidas (ver `RoleAuditService`) |
| `AUTH_AUDIT_SKIP` | string | Nao | - | `'true'` pula a auditoria de roles no bootstrap |

> JWT é **RS256** (SSO bidirecional painel-robo ↔ juri-api): não há mais
> `JWT_SECRET_KEY`/`JWT_EXPIRES_IN`. As chaves PEM ficam em uma única linha com
> `\n` literais, desescapados em runtime por `normalizePem()`. As envs marcadas
> **SSO** são opcionais no schema, mas o bootstrap faz fail-fast se faltarem
> (exceto em `NODE_ENV=test`).

## Usadas via process.env (sem validacao Zod)

| Variavel | Arquivo fonte | Tipo | Descricao |
|----------|--------------|------|-----------|
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
| `BRAPI_URL` | `brapi.service.ts` | string | URL base da API BRAPI (ex: `https://brapi.dev/api`) |
| `BRAPI_TOKEN` | `brapi.service.ts` | string | Token de autenticacao BRAPI |
| `SCRAPING_API_KEY` | `document.service.ts` | string | API key para autenticar chamadas ao scraping-fetch-robo (header `Authorization: Bearer`) |
| `WEBHOOK_SERVICE_KEY` | `service-webhook.guard.ts` | string | Segredo para webhooks internos (`x-service-key`) |
| `PIPEDRIVE_WEBHOOK_KEY` | `service-webhook.guard.ts` | string | Segredo dedicado para `/webhook-pipedrive` |
| `MICROSOFT_SITE_ID` | `sharepoint.service.ts` | string | SharePoint site ID (Graph API) |
| `MICROSOFT_DRIVE_ID` | `sharepoint.service.ts` | string | Document library drive ID |
| `MICROSOFT_ITEM_ID` | `sharepoint.service.ts` | string | Item ID do arquivo PLANILHA SOLVENCIA no drive |
| `MICROSOFT_CLIENT_ID` | `sharepoint.service.ts` | string | Azure AD App Registration Client ID |
| `MICROSOFT_SECRET_VALUE` | `sharepoint.service.ts` | string | Azure AD App Registration Client Secret |
| `MICROSOFT_DIRECTORY_ID` | `sharepoint.service.ts` | string | Azure AD Tenant (Directory) ID |

## Notas

- O schema Zod (`src/config/zod/env.ts`) valida o núcleo da app + auth/SSO/CORS; as demais são lidas direto de `process.env`.
- `GOOGLE_PRIVATE_KEY` precisa ter `\\n` literais que sao substituidos por `\n` reais no runtime.
- `AWS_SECRET_ID` default `juri-api-prd` carrega secrets do Secrets Manager em producao.
- `task-definition.json` e um template anonimo; a versao materializada para deploy deve ser gerada via `yarn render:task-definition`.
- `AUTH_STRICT_ROLE_AUDIT=true` deve ser usado apenas quando a base ja estiver saneada para `admin`/`advogado`. Em staging ou migracoes, `AUTH_AUDIT_SKIP=true` permite pular a auditoria explicitamente.
