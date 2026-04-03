import { normalizeString } from '../normalize-string';
import { compareDates } from '../compare-dates';

function validateIs36Months(movements = [], movementsTST = []) {
  const cond01 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    !movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );

  const cond02 = !movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        'remetidos os autos para tribunal superior do trabalho para processar recurso',
      ),
  );
  const cond03 = !movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /admitido em parte o recurso de revista de (reclamante|reclamada)/i,
      ),
  );
  const cond04 = !movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /admitido o recurso de revista de (reclamante|reclamada)/i,
      ),
  );
  const cond05 = !movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /nao admitido o recurso de revista de (reclamante|reclamada)/i,
      ),
  );

  if (cond01 && cond02 && cond03 && cond04 && cond05) return 36;
  return false;
}

function validateIs32Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(/transitado em julgado em/i),
    ) ||
    !movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match(/transitado em julgado em/i),
    );
  const cond02 = !movementsTST.find((movement) =>
    normalizeString(movement.conteudo).match(/agravo/i),
  );
  const cond03 = !movimentsProvisional?.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(/homologada a liquidacao/i),
  );
  const cond04 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        'remetidos os autos para tribunal superior do trabalho para processar recurso',
      ),
  );

  const cond05 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /admitido em parte o recurso de revista de (reclamante|reclamada)/i,
      ),
  );
  const cond06 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /admitido o recurso de revista de (reclamante|reclamada)/i,
      ),
  );
  const cond07 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        /nao admitido o recurso de revista de (reclamante|reclamada)/i,
      ),
  );

  if ((cond01 && cond02 && cond03 && cond04) || cond05 || cond06 || cond07) {
    return 32;
  }
  return false;
}

function validateIs28Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        'remetidos os autos para tribunal superior do trabalho para processar recurso',
      ),
  );
  const cond02 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    !movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond03 = movementsTST.find((movement) =>
    normalizeString(movement.conteudo).match('agravo'),
  );
  const cond04 = movimentsProvisional?.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match('homologada a liquidacao'),
  );

  if (cond01 && cond02 && (cond03 || cond04)) return 28;
  return false;
}

function validateIs24Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 = movements.find(
    (movement) =>
      ['SEGUNDO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match(
        'remetidos os autos para tribunal superior do trabalho para processar recurso',
      ),
  );
  const cond02 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    !movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond03 = movementsTST.find((movement) =>
    normalizeString(movement.conteudo).match('agravo'),
  );
  const cond04 = movimentsProvisional?.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match('homologada a liquidacao'),
  );

  if (cond01 && cond02 && cond03 && cond04) return 24;
  return false;
}

function validateIs20Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    !movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond02 = !movimentsProvisional?.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match('homologada a liquidacao'),
  );

  const cond03 = !movements.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match('homologada a liquidacao'),
  );

  if (cond01 && cond02 && cond03) return 20;
  return false;
}

function validateIs16Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond02 =
    movimentsProvisional?.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    ) ||
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    );

  const cond03 =
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('embargos a execucao'),
    ) ||
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('embargos a execucao'),
    );
  const cond04 =
    !movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('sentenca') &&
        compareDates(cond03?.data, movement?.data) === 'menor',
    ) ||
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('sentenca') &&
        compareDates(cond03?.data, movement?.data) === 'menor',
    );

  const cond05 =
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'impugnacao a sentenca de liquidacao',
        ),
    ) ||
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'impugnacao a sentenca de liquidacao',
        ),
    );
  const cond06 =
    !movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('sentenca') &&
        compareDates(cond05?.data, movement?.data) === 'menor',
    ) ||
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('sentenca') &&
        compareDates(cond05?.data, movement?.data) === 'menor',
    );

  const cond07 =
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    ) ||
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    );
  const cond08 =
    !movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para processar recurso',
        ) &&
        compareDates(cond07?.data, movement?.data) === 'menor',
    ) ||
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para processar recurso',
        ) &&
        compareDates(cond07?.data, movement?.data) === 'menor',
    );

  if (
    (cond01 && cond02 && cond03 && cond04) ||
    (cond05 && cond06) ||
    (cond07 && cond08)
  ) {
    return 16;
  }
  return false;
}

function validateIs12Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond02 =
    movimentsProvisional?.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    ) ||
    movements?.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    );
  const cond03 =
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    ) ||
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    );

  const cond04 =
    movimentsProvisional.find(
      (movement) =>
        (['PRIMEIRO_GRAU'].includes(movement.instancia) &&
          normalizeString(movement.conteudo).match(
            'remetidos os autos para orgao jurisdicional competente para processar recurso',
          ) &&
          compareDates(cond03?.data, movement?.data) === 'menor') ||
        compareDates(cond03?.data, movement?.data) === 'igual',
    ) ||
    movements.find(
      (movement) =>
        (['PRIMEIRO_GRAU'].includes(movement.instancia) &&
          normalizeString(movement.conteudo).match(
            'remetidos os autos para orgao jurisdicional competente para processar recurso',
          ) &&
          compareDates(cond03?.data, movement?.data) === 'menor') ||
        compareDates(cond03?.data, movement?.data) === 'igual',
    );

  const cond05 =
    !movimentsProvisional.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('acordao') &&
        compareDates(cond03?.data, movement?.data) === 'menor',
    ) ||
    !movements.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('acordao') &&
        compareDates(cond03?.data, movement?.data) === 'menor',
    );

  if (cond01 && cond02 && cond03 && cond04 && cond05) return 12;
  return false;
}

function validateIs8Months(
  movements = [],
  movimentsProvisional = [],
  movementsTST = [],
) {
  const cond01 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('transitado em julgado em'),
    ) ||
    movementsTST.find((movement) =>
      normalizeString(movement.conteudo).match('transitado em julgado em'),
    );
  const cond02 =
    movements?.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    ) ||
    movimentsProvisional?.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('homologada a liquidacao'),
    );

  const cond03 = !movimentsProvisional.find(
    (movement) =>
      ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
      normalizeString(movement.conteudo).match('embargos a execucao'),
  );
  const cond04 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'impugnacao a sentenca de liquidacao',
        ),
    ) ||
    !movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'impugnacao a sentenca de liquidacao',
        ),
    );

  const cond05 =
    !movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    ) ||
    !movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    );

  const cond06 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    ) ||
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        (normalizeString(movement.conteudo).match('agravo de peticao') ||
          normalizeString(movement.conteudo).match(/peticao.*agravo/i)),
    );

  const cond07 =
    movements.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para processar recurso',
        ) &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    ) ||
    movimentsProvisional.find(
      (movement) =>
        ['PRIMEIRO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para processar recurso',
        ) &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    );
  const cond08 =
    movements.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('acordao') &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    ) ||
    movimentsProvisional.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match('acordao') &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    );

  const cond09 =
    movements.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para prosseguir',
        ) &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    ) ||
    movimentsProvisional.find(
      (movement) =>
        ['SEGUNDO_GRAU'].includes(movement.instancia) &&
        normalizeString(movement.conteudo).match(
          'remetidos os autos para orgao jurisdicional competente para prosseguir',
        ) &&
        compareDates(cond06?.data, movement?.data) === 'menor',
    );

  if (
    (cond01 && cond02 && cond03 && cond04 && cond05) ||
    (cond06 && cond07 && cond08 && cond09)
  ) {
    return 8;
  }
  return false;
}

export {
  validateIs36Months,
  validateIs32Months,
  validateIs28Months,
  validateIs24Months,
  validateIs20Months,
  validateIs16Months,
  validateIs12Months,
  validateIs8Months,
};
