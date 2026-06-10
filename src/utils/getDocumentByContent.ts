import { normalizeString } from './normalize-string';

interface Moviment {
  conteudo: string;
  data: string;
  [key: string]: unknown;
}

interface DocumentItem {
  titulo: string;
  descricao: string;
  data: string;
  [key: string]: unknown;
}

function getDocumentByContent(
  contentRegex: RegExp,
  moviments: Moviment[],
  documents: DocumentItem[],
  onlyTitle = false,
) {
  try {
    const targetMoviment = moviments.find((moviment) =>
      contentRegex.test(normalizeString(moviment.conteudo)),
    );

    if (!targetMoviment) {
      return null;
    }

    const splitContent = targetMoviment.conteudo.split('|');
    if (splitContent.length === 2 && !onlyTitle) {
      const normString01 = normalizeString(splitContent[0].trim());
      const normString02 = normalizeString(
        splitContent[1].replace(/ \(RESTRITO\)/, '').trim(),
      );

      const documentSplitFound = documents.find((doc) => {
        const normTitulo = normalizeString(doc.titulo);
        const normDescricao = normalizeString(doc.descricao);
        return (
          (normTitulo.includes(normString01) ||
            normDescricao.includes(normString01) ||
            normDescricao.includes(normString02)) &&
          doc.data === targetMoviment.data
        );
      });

      if (documentSplitFound) {
        return documentSplitFound;
      }
    }

    if (splitContent.length === 2 && onlyTitle) {
      const normString01 = normalizeString(splitContent[0].trim());
      const normString02 = normalizeString(
        splitContent[1].replace(/ \(RESTRITO\)/, '').trim(),
      );

      const documentSplitFound = documents.find((doc) => {
        const normTitulo = normalizeString(doc.titulo);
        return (
          (normTitulo.includes(normString01) ||
            normTitulo.includes(normString02)) &&
          doc.data === targetMoviment.data
        );
      });

      if (documentSplitFound) {
        return documentSplitFound;
      }
    }

    const documentFound = documents.find(
      (doc) =>
        (normalizeString(doc.titulo).match(contentRegex) ||
          normalizeString(doc.descricao).match(contentRegex)) &&
        doc.data === targetMoviment.data,
    );

    return documentFound || null;
  } catch {
    return null;
  }
}

function getListDocumentByContent(
  contentRegex: RegExp,
  moviments: Moviment[],
  documents: DocumentItem[],
) {
  try {
    const targetMoviments = moviments.filter((moviment) =>
      contentRegex.test(normalizeString(moviment.conteudo)),
    );

    if (!targetMoviments.length) {
      return null;
    }

    const documentFounds = [];

    for (const targetMoviment of targetMoviments) {
      const splitContent = targetMoviment.conteudo.split('|');
      if (splitContent.length === 2) {
        const normString01 = normalizeString(splitContent[0].trim());
        const normString02 = normalizeString(
          splitContent[1].replace(/ \(RESTRITO\)/, '').trim(),
        );

        const documentSplitFounds = documents.filter((doc) => {
          const normTitulo = normalizeString(doc.titulo);
          const normDescricao = normalizeString(doc.descricao);
          return (
            (normTitulo.includes(normString02) ||
              normDescricao.includes(normString01)) &&
            doc.data === targetMoviment.data
          );
        });

        if (documentSplitFounds.length > 0) {
          documentFounds.push(...documentSplitFounds);
          continue;
        }
      }

      const documentFound = documents.find(
        (doc) =>
          (normalizeString(doc.titulo).match(contentRegex) ||
            normalizeString(doc.descricao).match(contentRegex)) &&
          doc.data === targetMoviment.data,
      );

      if (documentFound) {
        documentFounds.push(documentFound);
      }
    }

    return documentFounds || null;
  } catch {
    return null;
  }
}

export default getDocumentByContent;

export { getListDocumentByContent };
