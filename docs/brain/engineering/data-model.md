# Data Model

## MongoDB Schemas (Mongoose)

### Process (schema central)

`src/modules/process/schema/process.schema.ts`

Campos principais: number, title, situation (PENDING/LOSS/APPROVED), stage, stageId, companies[], complainant, processParts[], documents[], instancias[], moviments[], valueCase, dealId, formPipedrive, simpleCalcProposals, observation, insights[], processExecution, processMain, processOwner, rejectionReason, rejectionDescription, unreadByUsers[], processStatus, synchronizedAt, hasDocuments, hasInstancias.

### ProcessStatus

`src/modules/process/schema/process-status.schema.ts`

Rastreia estado de processamento (PROCESSING_WITH_MOVIMENTS, PROCESSING_WITH_DOCUMENTS, PROCESS_WAITING_EXTRACTION_DOCUMENTS, EXTRACTION_MOVIMENTS_FINISHED, EXTRACTION_DOCUMENTS_FINISHED).

### ProcessDecisions

`src/modules/process/schema/process-decisions.schema.ts`

Historico de decisoes (stage changes, aprovacoes, rejeicoes) com user_id e timestamps.

### ProcessOwner

`src/modules/process/schema/process-owner.schema.ts`

Vincula processo a usuario responsavel.

### ClaimedProcesses

`src/modules/process/schema/claimed-processes.schema.ts`

Processos reivindicados por usuarios.

### Complainant

`src/modules/process/schema/complainant.schema.ts`

Dados do reclamante (parte autora).

### Company

`src/modules/process/schema/company.schema.ts`

Empresa reclamada: cnpj, name, fantasyName, partners[], legalNature, taxRegime, registrationStatus, specialRule (solvente/insolvente), score, porte, cndt.

### Step

`src/modules/process/schema/step.schema.ts`

Definicao de esteiras/steps de workflow.

### Prompt

`src/modules/process/schema/prompt.schema.ts`

Template de prompt AI: type (PromptType), content.

### User

`src/modules/user/schema/user.schema.ts`

Usuario: email, password (hashed), role (admin/advogado), isActive.

### Notification

`src/modules/notification/schema/notication.schema.ts`

Notificacao: tipo (ACTIVITY/SYSTEM_NOTIFICATION), userId, message, isRead.

### Observation

`src/modules/observation/schema/observation.schema.ts`

Nota livre sobre processo: processId, description.

### ReasonLoss

`src/modules/reason-loss/schema/reason-loss.schema.ts`

Motivo de rejeicao configuravel.

## Relacoes

- Process -> Company (embedded array).
- Process -> Complainant (embedded).
- Process -> ProcessDecisions (referencia).
- Process -> ProcessOwner (referencia).
- Process -> ProcessStatus (referencia).
- Notification -> User (via userId).
- Observation -> Process (via processId).
