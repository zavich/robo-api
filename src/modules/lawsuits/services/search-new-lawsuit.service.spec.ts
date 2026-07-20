import { BadRequestException } from '@nestjs/common';
import { SearchNewLawsuitService } from './search-new-lawsuit.service';
import { InsertLawsuitPlaceholderService } from './insert-lawsuit-placeholder.service';
import { TriggerScrapingService } from './trigger-scraping.service';

describe('SearchNewLawsuitService', () => {
  let service: SearchNewLawsuitService;
  let insertLawsuitPlaceholderService: { execute: jest.Mock };
  let triggerScrapingService: { execute: jest.Mock };

  const userId = 'user-a';

  beforeEach(() => {
    insertLawsuitPlaceholderService = { execute: jest.fn() };
    triggerScrapingService = { execute: jest.fn() };

    service = new SearchNewLawsuitService(
      insertLawsuitPlaceholderService as unknown as InsertLawsuitPlaceholderService,
      triggerScrapingService as unknown as TriggerScrapingService,
    );
  });

  it('rejeita número de processo inválido sem tocar em comunicacao-spot ou disparar extração', async () => {
    await expect(service.execute('invalido', userId)).rejects.toThrow(
      BadRequestException,
    );

    expect(insertLawsuitPlaceholderService.execute).not.toHaveBeenCalled();
    expect(triggerScrapingService.execute).not.toHaveBeenCalled();
  });

  it('garante marcador BUSCANDO em comunicacao-spot e dispara extração sem documentos, repassando o usuário só pro trigger', async () => {
    const numeroCnj = '1000580-10.2023.5.02.0492';

    const result = await service.execute(numeroCnj, userId);

    expect(insertLawsuitPlaceholderService.execute).toHaveBeenCalledWith(
      numeroCnj,
    );

    expect(triggerScrapingService.execute).toHaveBeenCalledWith(
      numeroCnj,
      userId,
      { documents: false },
    );

    expect(result).toEqual({ message: 'Busca iniciada' });
  });
});
