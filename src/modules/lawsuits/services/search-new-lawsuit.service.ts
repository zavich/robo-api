import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parseCnj } from '../utils/cnj.util';
import { InsertLawsuitPlaceholderService } from './insert-lawsuit-placeholder.service';
import { TriggerScrapingService } from './trigger-scraping.service';

// Processo que ainda não existe no Athena: antes de disparar a extração,
// garante um marcador "BUSCANDO" em comunicacao-spot (via
// `InsertLawsuitPlaceholderService` — só grava se não existir nada lá ainda,
// nunca sobrescreve dado real de outro coletor) — quem lê esses arquivos
// direto do S3 (ex.: o coletor Python communication-ingestor-juri) enxerga
// que uma busca está em andamento, sem esperar o primeiro webhook chegar.
@Injectable()
export class SearchNewLawsuitService {
  private readonly logger = new Logger(SearchNewLawsuitService.name);

  constructor(
    private readonly insertLawsuitPlaceholderService: InsertLawsuitPlaceholderService,
    private readonly triggerScrapingService: TriggerScrapingService,
  ) {}

  async execute(numeroCnj: string, userId: string) {
    const parsed = parseCnj(numeroCnj);
    if (!parsed) {
      throw new BadRequestException('Número de processo inválido');
    }

    await this.insertLawsuitPlaceholderService.execute(numeroCnj);

    // Primeira busca: só movimentações (documents:false) — documentos
    // restritos ficam pra um sync manual depois, evitando gastar
    // captcha/custo num processo que o usuário ainda nem confirmou existir.
    await this.triggerScrapingService.execute(numeroCnj, userId, {
      documents: false,
    });

    this.logger.log(`Busca inicial disparada para ${numeroCnj}`);

    return { message: 'Busca iniciada' };
  }
}
