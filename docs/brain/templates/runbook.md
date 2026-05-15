# Runbook: <Sintoma>

Use quando <condicao operacional>.

## Primeiros 10 minutos

1. Confirmar identificadores e horario.
2. Ler documentos de entrada.
3. Checar runtime relevante.
4. Separar falha de dado, API externa, persistencia, fila ou regra.

## Stop/go

- Nao executar acao destrutiva sem causa raiz.
- Nao salvar credenciais, payload sensivel ou dados pessoais no brain.
- Registrar causa raiz duravel no mapa da feature.
