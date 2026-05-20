# Workflow: Investigacao Progressiva

## Quando usar

Use quando a task for ampla, a area for pouco conhecida ou nao houver mapa de feature especifico.

## Passos

1. Identificar termos-chave da task e buscar no codigo com `rg`.
2. Localizar pontos de entrada: controller, service, worker ou cron.
3. Seguir dependencias: schemas, services, providers, utils.
4. Localizar testes existentes da mesma area.
5. Se houver mapa de feature, comparar com o encontrado.
6. Atualizar o brain com conhecimento confirmado.
7. Executar testes relevantes quando a task alterar comportamento.

## Arquivos comuns

- `src/modules/process/process.controller.ts` (maior controller).
- `src/modules/process/process.module.ts` (maior module).
- `src/app.module.ts` (composicao da app).

## Riscos

- Nao confiar apenas no brain; sempre verificar o codigo atual.
