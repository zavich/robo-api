import * as dayjs from 'dayjs';

function compareDates(data1: string, data2: string) {
  // Converte as datas para o formato Date utilizando dayjs
  const d1 = dayjs(data1, 'DD/MM/YYYY');
  const d2 = dayjs(data2, 'DD/MM/YYYY');

  // Comparação entre as duas datas e retorno das strings desejadas
  if (d1.isAfter(d2)) {
    return 'maior';
  } else if (d1.isBefore(d2)) {
    return 'menor';
  } else {
    return 'igual';
  }
}

export { compareDates };