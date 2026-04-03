import { Injectable } from "@nestjs/common";
import { AddNoteDto } from "../dto/add-note.dto";
import { addNoteToPipedrive } from "src/service/pipedrive/add-note";

@Injectable()
export class AddNoteService {
  constructor() { }

  async addNote({ content, dealId }: AddNoteDto) {
    const formattedContent = this.formatNoteContent(content);
    
    await addNoteToPipedrive({
      content: formattedContent,
      dealId,
    });
    return {
      message: 'Note added successfully',
    };
  }

  /**
   * Formata o conteúdo da nota para o Pipedrive com HTML
   * @param content - Conteúdo bruto da nota
   * @returns Conteúdo formatado com HTML
   */
  private formatNoteContent(content: string): string {
    if (!content || typeof content !== 'string') {
      return content;
    }

    // Remove espaços extras e quebras de linha desnecessárias
    let formatted = content.trim();

    // Se o conteúdo já tem formatação HTML, retorna como está
    if (formatted.includes('<div') || formatted.includes('<h') || formatted.includes('<span')) {
      return formatted;
    }

    // Detecta se é uma planilha de cálculos baseado em palavras-chave
    const isCalculationSheet = this.isCalculationSheet(content);
    
    if (isCalculationSheet) {
      return this.formatCalculationSheet(content);
    }

    // Detecta se é uma lista de itens (com ou sem bullet points)
    if (this.isListContent(content)) {
      return this.formatListContent(content);
    }

    // Detecta se tem título e conteúdo
    if (this.hasTitleAndContent(content)) {
      return this.formatTitleAndContent(content);
    }

    // Formatação padrão para texto simples
    return this.formatSimpleText(content);
  }

  /**
   * Verifica se o conteúdo é uma planilha de cálculos
   */
  private isCalculationSheet(content: string): boolean {
    const calculationKeywords = [
      'Owner Type',
      'Margem Percentual',
      'Valor com Margem',
      'Valor Pós FGTS',
      'Valor Pós Honorários',
      'Deságio',
      'reclamada',
      'reclamante',
      'planilha',
      'cálculo',
      'IMPUGNAÇÃO'
    ];

    const lines = content.split('\n').filter(line => line.trim());
    
    // Conta quantas linhas contêm palavras-chave de cálculo
    const calculationLines = lines.filter(line => 
      calculationKeywords.some(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    // Se mais de 30% das linhas contêm palavras-chave de cálculo, é uma planilha
    return calculationLines.length >= lines.length * 0.3;
  }

  /**
   * Formata planilha de cálculos com HTML
   */
  private formatCalculationSheet(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    
    // Detecta título personalizado na primeira linha
    let title = 'Notas - Planilha de Cálculos';
    let startIndex = 0;
    
    // Se a primeira linha parece um título (não contém ':'), usa como título
    if (lines.length > 0 && !lines[0].includes(':')) {
      const firstLine = lines[0].trim();
      if (firstLine.length < 100 && !firstLine.endsWith('.') && !firstLine.endsWith('!') && !firstLine.endsWith('?')) {
        title = firstLine;
        startIndex = 1;
      }
    }
    
    // Procura por referência a PDF ou documento no título
    const pdfMatch = title.match(/\(([^)]*\.pdf)\)/i);
    if (pdfMatch) {
      title = title.replace(`(${pdfMatch[1]})`, '').trim();
    }

    // Processa cada linha para criar lista formatada
    const formattedLines = lines.slice(startIndex).map(line => {
      const trimmed = line.trim();
      
      // Se a linha contém dois pontos, formata como chave: valor
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        return `<div style="margin-bottom: 6px;">
          <span style="font-weight: bold;">${key.trim()}:</span> ${value}
        </div>`;
      }
      
      // Se a linha começa com hífen, remove e formata
      if (trimmed.startsWith('-')) {
        const content = trimmed.substring(1).trim();
        return `<div style="margin-bottom: 6px;">${content}</div>`;
      }
      
      // Outras linhas como itens da lista
      return `<div style="margin-bottom: 6px;">${trimmed}</div>`;
    });

    return `
      <div style="font-family: Arial, sans-serif; font-size: 14px; background: #fff; padding: 20px; border-radius: 8px; max-width: 600px;">
        <h3 style="text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #333;">${title}</h3>
        <div style="background: #F8F9FA; border-radius: 4px; padding: 12px; margin-top: 8px; border-left: 3px solid #007bff;">
          ${formattedLines.join('')}
        </div>
      </div>
    `;
  }

  /**
   * Verifica se o conteúdo é uma lista
   */
  private isListContent(content: string): boolean {
    const lines = content.split('\n').filter(line => line.trim());
    
    // Verifica se a maioria das linhas são itens de lista
    const listItems = lines.filter(line => 
      line.trim().startsWith('-') || 
      line.trim().startsWith('•') || 
      line.trim().startsWith('*') ||
      line.trim().match(/^\d+\./)
    );

    return listItems.length >= lines.length * 0.5; // 50% ou mais são itens de lista
  }

  /**
   * Formata conteúdo de lista com HTML
   */
  private formatListContent(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    
    const formattedLines = lines.map(line => {
      const trimmed = line.trim();
      
      // Remove marcadores existentes
      let cleanLine = trimmed;
      if (trimmed.match(/^[-•*]\s/)) {
        cleanLine = trimmed.replace(/^[-•*]\s/, '');
      } else if (trimmed.match(/^\d+\.\s/)) {
        cleanLine = trimmed.replace(/^\d+\.\s/, '');
      }
      
      return `<div style="margin-bottom: 4px; padding-left: 12px; position: relative;">
        <span style="position: absolute; left: 0; color: #666; font-size: 12px;">•</span>
        ${cleanLine}
      </div>`;
    });

    return `
      <div style="font-family: Arial, sans-serif; font-size: 14px; background: #fff; padding: 16px; border-radius: 6px; max-width: 500px;">
        <div style="background: #F8F9FA; border-radius: 4px; padding: 12px; border-left: 3px solid #28a745;">
          ${formattedLines.join('')}
        </div>
      </div>
    `;
  }

  /**
   * Verifica se tem título e conteúdo separados
   */
  private hasTitleAndContent(content: string): boolean {
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) return false;
    
    // Verifica se a primeira linha parece um título (mais curta, sem pontuação final)
    const firstLine = lines[0].trim();
    const isTitle = firstLine.length < 100 && 
                   !firstLine.endsWith('.') && 
                   !firstLine.endsWith('!') && 
                   !firstLine.endsWith('?');
    
    return isTitle;
  }

  /**
   * Formata título e conteúdo com HTML
   */
  private formatTitleAndContent(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    const title = lines[0].trim();
    const contentLines = lines.slice(1);
    
    const formattedContent = contentLines.map(line => line.trim()).join('<br>');
    
    return `
      <div style="font-family: Arial, sans-serif; font-size: 14px; background: #fff; padding: 16px; border-radius: 6px; max-width: 600px;">
        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #333; text-align: center;">${title}</h3>
        <div style="background: #F8F9FA; border-radius: 4px; padding: 12px; margin-top: 8px; border-left: 3px solid #ffc107;">
          ${formattedContent}
        </div>
      </div>
    `;
  }

  /**
   * Formata texto simples com HTML
   */
  private formatSimpleText(content: string): string {
    // Se é muito curto, retorna como está
    if (content.length < 50) {
      return content;
    }
    
    // Se tem parágrafos, formata com HTML
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length > 1) {
      const formattedParagraphs = paragraphs.map(p => `<p style="margin-bottom: 8px; line-height: 1.4;">${p.trim()}</p>`).join('');
      
      return `
        <div style="font-family: Arial, sans-serif; font-size: 14px; background: #fff; padding: 16px; border-radius: 6px; max-width: 500px;">
          <div style="background: #F8F9FA; border-radius: 4px; padding: 12px; border-left: 3px solid #6c757d;">
            ${formattedParagraphs}
          </div>
        </div>
      `;
    }
    
    // Texto simples com uma linha
    return `
      <div style="font-family: Arial, sans-serif; font-size: 14px; background: #fff; padding: 16px; border-radius: 6px; max-width: 500px;">
        <div style="background: #F8F9FA; border-radius: 4px; padding: 12px; border-left: 3px solid #6c757d;">
          ${content}
        </div>
      </div>
    `;
  }
}