import {
  bucketIdFor,
  bucketIdsForRange,
  estimatePercentile,
  latencyBucketLabel,
  media,
} from './pipeline-metrics.util';

describe('pipeline-metrics.util', () => {
  describe('bucketIdsForRange', () => {
    it('devolve uma hora por ponto, da mais antiga para a mais recente', () => {
      const agora = new Date('2026-08-26T13:42:11.000Z');
      const ids = bucketIdsForRange(agora, 3);

      expect(ids).toEqual(['2026-08-26T11', '2026-08-26T12', '2026-08-26T13']);
    });

    it('atravessa a virada do dia sem furo na série', () => {
      const ids = bucketIdsForRange(new Date('2026-08-26T00:05:00.000Z'), 2);

      expect(ids).toEqual(['2026-08-25T23', '2026-08-26T00']);
    });

    it('cobre a janela de 7 dias sem repetir bucket', () => {
      const ids = bucketIdsForRange(new Date('2026-08-26T13:00:00.000Z'), 168);

      expect(ids).toHaveLength(168);
      expect(new Set(ids).size).toBe(168);
    });
  });

  describe('bucketIdFor', () => {
    it('usa UTC, não o fuso local, para o rótulo da hora', () => {
      expect(bucketIdFor(new Date('2026-08-26T03:00:00.000Z'))).toBe(
        '2026-08-26T03',
      );
    });
  });

  describe('latencyBucketLabel', () => {
    it('classifica pela primeira faixa que o valor não alcança', () => {
      expect(latencyBucketLabel(5_000)).toBe('10000');
      expect(latencyBucketLabel(10_000)).toBe('30000');
      expect(latencyBucketLabel(45_000)).toBe('60000');
    });

    it('joga o que passa da maior faixa na faixa aberta', () => {
      expect(latencyBucketLabel(60 * 60 * 1000)).toBe('inf');
    });
  });

  describe('estimatePercentile', () => {
    it('devolve null quando não há amostra', () => {
      expect(estimatePercentile({}, 0.5)).toBeNull();
    });

    it('interpola dentro da faixa em que o percentil cai', () => {
      // 10 amostras entre 10s e 30s: a mediana fica no meio da faixa.
      expect(estimatePercentile({ '30000': 10 }, 0.5)).toBe(20_000);
    });

    it('leva em conta as faixas anteriores ao acumular', () => {
      // 90 amostras abaixo de 10s e 10 entre 10s e 30s: o p95 cai na
      // segunda faixa, na metade dela.
      const p95 = estimatePercentile({ '10000': 90, '30000': 10 }, 0.95);

      expect(p95).toBe(20_000);
    });

    it('devolve o piso da faixa aberta quando o percentil cai nela', () => {
      expect(estimatePercentile({ inf: 5 }, 0.95)).toBe(1_800_000);
    });
  });

  describe('media', () => {
    it('não divide por zero quando não houve amostra', () => {
      expect(media(0, 0)).toBeNull();
    });

    it('arredonda para milissegundo inteiro', () => {
      expect(media(10, 3)).toBe(3);
    });
  });
});
