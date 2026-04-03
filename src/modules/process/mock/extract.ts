//RÉU = TRATADO COMO EMPRESA PROCESSADA
//AUTOR = TRATADO COMO RECLAMANTE NO PROCESSO
//ACÓRDÃO = VEM NA SEGUNDA INSTANCIA E A IDENTIFICAÇÃO É NA MOVIMENTAÇÃO DESCRITA 'ACÓRDÃO | ACÓRDÃO'
//REAVALIAR (RODAR O CRON) APENAS PROCESSOS QUE NÃO TIVERAM ACORDÃO ACÓRDÃO

//FAZER
// salvar movimentações do processo inicial

//DUVIDA: TEM CASOS QUE NO JSON, AS PARTES NÃO ESTÁ SENDO RETORNADOS RÉU E AUTOR E SIM POLO PASSIVO E POLO ATIVO,
// NESSE CASO, QUEM É O RECLAMANTE E O RECLAMADO?

//TODO
// EM CASO DE VALIDAÇÃO SEJA PELA A POSIÇÃO DO ARRAY DE INSTANCIA, ALTERAR PARA BUSCAR POR 'PRIMEIRO_GRAU' OU 'SEGUNDO_GRAU'

const classesAprovar = [
  'ATOrd',
  'ATSum',
  'Ação Trabalhista - Rito Ordinário',
  'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
  'CumPrSe',
  'CumSen',
  'Ação Trabalhista - Rito Sumaríssimo',
  'ATAlc',
  'AR',
  'Cumprimento de sentença',
  'Cumprimento Provisório de Sentença',
  'Ação Trabalhista - Rito Sumário (Alçada)',
  'Recurso Ordinário Trabalhista',
  'Execução Provisória em Autos Suplementares',
  'Agravo de Instrumento em Recurso de Revista',
  'Agravo de Petição',
  'Embargos de Declaração',
  'Recurso Ordinário',
];

const execucaoProvisoria = [
  'cumprimento provisório de sentença',
  'cumprimento de sentença',
  'execução provisória em autos suplementares',
  'cumprimento provisorio de sentenca',
  'cumprimento de sentenca',
  'cumprimento provisorio de sentenca',
  'cumprse',
  'cumsen',
  'ExProvAS',
];

const processoPrincipal = [
  'ação trabalhista - rito ordinário (rtord)',
  'ação trabalhista - rito sumaríssimo (rtsum)',
  'ação trabalhista - rito ordinário',
  'ação trabalhista - rito sumaríssimo',
  'ação trabalhista rito ordinário (rtord)',
  'ação trabalhista rito sumaríssimo (rtsum)',
  'ação trabalhista rito ordinário ',
  'ação trabalhista rito sumaríssimo ',
  'atord',
  'atsum',
];

export { classesAprovar, execucaoProvisoria, processoPrincipal };
