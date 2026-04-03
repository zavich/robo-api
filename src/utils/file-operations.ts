import axios from 'axios';
import * as fs from 'fs';
import { createWriteStream } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

async function downloadFile(url, localFilePath) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${process.env.ESCAVADOR_TOKEN}`,
    },
  });

  const writer = createWriteStream(localFilePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function isPdfEmptyOrCorrupt(filePath: string): Promise<boolean> {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    // Tenta carregar o PDF
    const pdfDoc = await PDFDocument.load(fileBuffer);

    // Verifica se há páginas no PDF
    if (pdfDoc.getPageCount() === 0) {
      console.log(pdfDoc.getPageCount());
      console.log('PDF está vazio.');
      return true;
    }

    // Verifica se há conteúdo nas páginas
    // const page = pdfDoc.getPage(0);
    // const textContent = await page.getTextContent();
    // if (!textContent.items || textContent.items.length === 0) {
    //   console.log('PDF não possui conteúdo visível.');
    //   return true;
    // }

    return false; // PDF não está vazio e não é inválido
  } catch (error) {
    console.error('Erro ao carregar o PDF:', error.message);
    return true; // Considera como inválido em caso de erro
  }
}

export { downloadFile, isPdfEmptyOrCorrupt };
