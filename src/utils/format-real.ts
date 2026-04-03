export function formatReal(value: string) {
  return value
    .replace('R$', '') // Remove o símbolo "R$"
    .replace('.', '') // Remove os pontos dos milhares
    .replace(',', '.') // Troca a vírgula pelo ponto decimal
    .trim(); // Remove espaços extras
}
