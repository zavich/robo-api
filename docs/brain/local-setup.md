# Brain Local Setup

## Setup basico

1. Instale dependencias:

```bash
npm install
```

2. Suba Redis via Docker:

```bash
docker compose up redis-robo -d
```

3. Configure variaveis de ambiente (`.env` ou export):

```bash
DATABASE_URL="mongodb://..."
PORT=8080
REDIS_URL="redis://localhost:6381"
# SSO RS256 (PEM em uma linha, com \n literais). Ver docs/brain/specs/auth-system.md
JWT_PRIVATE_KEY_ROBO_API="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY_ROBO_API="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_PUBLIC_KEY_JURI_API="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
GOOGLE_PROJECT_ID="..."
GOOGLE_VERTEX_LOCATION="..."
GOOGLE_CLIENT_EMAIL="..."
GOOGLE_PRIVATE_KEY="..."
GOOGLE_VERTEX_MODEL="..."
AWS_S3_BUCKET_NAME="..."
AWS_REGION="sa-east-1"
NODE_ENV="development"
```

4. Rode o servidor:

```bash
npm run start:dev
```

API disponivel em `http://localhost:8080/v1`. Swagger em `http://localhost:8080/api`.

## Bull Board

Em desenvolvimento, Bull Board esta disponivel em `http://localhost:8080/bull-board` para visualizar filas.

## Rotina por task

1. Leia `docs/brain/INDEX.md`.
2. Identifique a area da task no `task-router.md`.
3. Abra os mapas de feature relevantes.
4. Investigue o codigo real.
5. Atualize o brain se o conhecimento for reutilizavel.

## Regras locais

- Nao salvar segredos em `docs/brain/`.
- Nao colocar payloads sensiveis em postmortems.
