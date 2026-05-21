# Data Schemas (MongoDB)

## User (collection: `users`)

```
email:     String, required, unique
password:  String, required (bcrypt hashed, rounds=10)
isActive:  Boolean, required, default: true
role:      String, enum: ['admin', 'advogado'], required, default: 'advogado'
name:      String, required
createdAt, updatedAt: auto (timestamps: true)
```

---

## Process (collection: `processes`)

```
unreadByUsers:                    String[], default: []
processStatus:                    ObjectId → ProcessStatus
number:                           String
title:                            String
situation:                        Enum: 'PENDING' | 'LOSS' | 'APPROVED'
sentToRecords:                    String ('SENT' | 'NOT_FOUND' | 'FOUND')
registrationStatus:               String
legalNature:                      String
taxRegime:                        String
complainant:                      ObjectId → Complainant
autosData:                        { class, relator, status?, ativo, passivo, dateOfTransit, dateOfDistribution, movements[] }
moviments:                        Array (movimentacoes flat de todas instancias)
class:                            String ('MAIN' | 'PROVISIONAL_EXECUTION')
arquived:                         Boolean
valueCase:                        Number
documents:                        RestrictedDocument[] (subdocument)
processMain:                      ObjectId → Process (opcional, ref ao processo principal)
processNumberMain:                String (opcional)
processParts:                     ProcessParts[] (id, nome, tipo, polo, principal, documento)
origem:                           String
instanciasAutos:                  Array (instancias TST raw)
instancias:                       Array (instancias TRT raw do webhook scraping)
creditValue:                      Number
resJudicata:                      Boolean
dealId:                           Number (Pipedrive deal ID)
noteId:                           Number (Pipedrive note ID)
calledByProvisionalLawsuitNumber: String
stage:                            Enum: 'ANALISE' | 'PRE_ANALISE' | 'CALCULO', default: 'PRE_ANALISE'
stageId:                          Number (Pipedrive stage ID)
synchronizedAt:                   Date
oldMoviments:                     Mixed
formPipedrive:                    Mixed (PipedriveFormData shape)
activities:                       ActivityDocument[] (subdocument)
scraperRetryCount:                Number, default: 0 (vide nota de migracao abaixo)
createdAt, updatedAt:             auto
```

#### Nota sobre `scraperRetryCount` (campo introduzido pela refatoracao 2026-05)

O campo armazena o numero de retentativas automaticas que o `WebhookErroHandler` ja efetuou para um processo apos status `ERRO`/`NAO_ENCONTRADO`. O schema declara `default: 0`, entao documentos NOVOS sempre tem 0.

**Para documentos legados** (criados antes do campo existir), `scraperRetryCount` e `undefined` em vez de 0. O `WebhookErroHandler` (`src/modules/process/services/handlers/webhook-erro.handler.ts`) usa o filtro:

```typescript
$or: [
  { scraperRetryCount: { $exists: false } },
  { scraperRetryCount: { $lt: MAX_SCRAPER_RETRIES } },
]
```

Esse `$or` garante que documentos legados (campo ausente) sao tratados como "0 retries" — mesmo comportamento que documentos novos.

**Alternativa (opcional):** rodar uma migration de uma vez para popular o campo em todos os documentos legados:

```javascript
db.processes.updateMany(
  { scraperRetryCount: { $exists: false } },
  { $set: { scraperRetryCount: 0 } }
);
```

Apos a migration, o `$or` no handler pode ser simplificado para `{ scraperRetryCount: { $lt: MAX_SCRAPER_RETRIES } }` — mas nao e obrigatorio.

### RestrictedDocument (subdocument de Process.documents)

```
type:       String, required (ProcessDocumentType enum)
title:      String, required
extension:  String, required
data:       Object, required (dados extraidos por AI)
temp_link:  String, required (chave S3)
uniqueName: String, opcional
date:       String, opcional
instancia:  String, opcional
status:     Enum: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR', default: 'PENDING'
```

### ActivityDocument (subdocument de Process.activities, _id: false)

```
type:        Enum: 'PRE_ANALISE' | 'ANALISE' | 'CALCULO', required
assignedTo:  ObjectId → User, required
assignedBy:  ObjectId → User, required
completedBy: ObjectId → User, required
isCompleted: Boolean, required, default: false
completedAt: Date, default: null
createdAt:   Date, default: Date.now
updatedAt:   Date, default: Date.now
notes:       String, opcional, default: null
status:      Enum: 'LOSS' | 'APROVED', required
lossReason:  String, opcional
```

### ProcessDocumentType enum

```
HomologacaoDeCalculo, PeticaoInicial, AdmissibilidadeRR,
HomologacaoDeAcordo, RRReclamada, RecursoDeRevista,
SentencaMerito, SentencaED, SentencaEE, Acordao,
AcordaoMerito, AcordaoED, AcordaoAP, AcordaoTRT,
RRAP, EmendaAInicial, Alvara, PlanilhaCalculo,
Parcelamento916, Impugnacao, Garantia, Decisao (alias DecisaoPrevencao)
```

---

## ProcessStatus (collection: `processstatuses`)

```
name:        String (PROCESSSTATUSENUM values)
step:        ObjectId → Step
log:         String
errorReason: String
createdAt, updatedAt: auto
```

**PROCESSSTATUSENUM values**:
```
PROCESSING_WITH_MOVIMENTS
PROCESSING_WITH_DOCUMENTS
PROCESS_WAITING_EXTRACTION_DOCUMENTS
EXTRACTION_MOVIMENTS_FINISHED
EXTRACTION_DOCUMENTS_FINISHED
```

---

## ProcessDecisions (collection: `processdecisions`)

```
process_id: ObjectId → User (NOTA: ref e User.name — parece bug, deveria ser Process)
history:    History[] subdocuments
createdAt, updatedAt: auto
```

### History (subdocument, _id: false, timestamps: true)

```
status:                       Enum: 'PENDING' | 'LOSS' | 'APPROVED', required, default: 'PENDING'
stage:                        Enum: 'ANALISE' | 'PRE_ANALISE' | 'CALCULO', required, default: 'PRE_ANALISE'
rejection_reason?:            String
stage_id?:                    Number
custom_rejection_description?: String[]
is_custom_reason?:            Boolean
user_id:                      ObjectId → User
updatedAt?:                   Date
createdAt?:                   Date
```

---

## Step (collection: `steps`)

```
name:     String
slug:     String (step-1 a step-9)
next:     String (slug do proximo step)
previous: String (slug do step anterior)
createdAt, updatedAt: auto
```

**Pipeline de steps**:

| slug | Job BullMQ | Descricao |
|------|-----------|-----------|
| step-1 | `process-validation` | Validacao do processo |
| step-2 | `solvency-validation` | Validacao de solvencia |
| step-3 | `extract-document` | Extracao de documentos |
| step-4 | `initial-petition` | Peticao inicial |
| step-5 | `filter-value` | Filtro de valor |
| step-6 | `liberation` | Liberacao |
| step-7 | `parameters` | Parametros |
| step-8 | `resources` | Recursos |
| step-9 | `simple-calc` | Calculo simples |

**Nota**: steps 5-9 sao enfileirados por `NextStepsService` mas seus consumers NAO existem neste codebase (possivelmente em servico separado).

---

## Notification (collection: `notifications`)

```
title:       String, required
description: String, required
userId:      ObjectId → User
read:        Boolean, default: false
type:        Enum: 'ACTIVITY' | 'SYSTEM', required
redirectId?: String (numero do processo para deep linking)
createdAt, updatedAt: auto
```

---

## Observation (collection: `observations`)

```
description: String, required
processId:   ObjectId → Process
createdAt, updatedAt: auto
```

---

## Complainant (collection: `complainants`)

```
name:   String
cpf:    String
email:  String[]
phones: String[]
cep:    String
createdAt, updatedAt: auto
```

---

## Company (collection: `companies`)

```
name:               String
process:            ObjectId → Process
cnpj:               String
socialReason:       String
fantasyName:        String
email:              String
registrationStatus: String
legalNature:        String
taxRegime:          String
specialRule:        Enum: 'solvente' | 'insolvente', default: null
integrationId:      String
isSolvent:          Boolean
errorReason:        String
partners:           Array (socios do EmpresaQui)
socialCapital:      String
reason:             String
invoicing:          String
porte:              String
cndt:               Mixed
score:              Number
createdAt, updatedAt: manual + auto
```

---

## ClaimedProcesses (collection: `claimedprocesses`)

```
companyId:  ObjectId → Company
processId:  ObjectId → Process
createdAt, updatedAt: auto
```

---

## ProcessOwner (collection: `processowners`)

```
processId: ObjectId → Process, required
userId:    ObjectId → User, required
isActive:  Boolean, default: true
createdAt, updatedAt: auto
```

---

## Prompt (collection: `prompts`)

```
type: String, required
text: String
createdAt, updatedAt: auto
```

**Tipos usados pelo sistema**:
```
PeticaoInicial, PlanilhaCalculo, Alvara, HomologacaoDeAcordo,
AcordoEParcelamento, Homologacao, Acordao, AcordaoMerito,
AdmissibilidadeRR, RecursoDeRevista, Decisao, SentencaMerito,
SentencaED, SentencaEE, Garantia
```

---

## ReasonLoss (collection: `reasonlosses`)

```
key:   String
label: String
createdAt, updatedAt: auto
```
