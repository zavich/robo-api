import { normalizeString } from './normalize-string';

function getDocumentByContent(
  contentRegex: RegExp,
  moviments: any[],
  documents: any[],
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
    console.log('splitContent: ', splitContent);
    if (splitContent.length === 2 && !onlyTitle) {
      const string01 = splitContent[0].trim();
      const string02 = splitContent[1].replace(/ \(RESTRITO\)/, '').trim();

      const documentSplitFound = documents.find(
        (doc) =>
          (doc.titulo.match(string01) ||
            doc.descricao.match(string01) ||
            doc.descricao.match(string02)) &&
          doc.data === targetMoviment.data,
      );

      if (documentSplitFound) {
        console.log('documentSplitFound: ', documentSplitFound);
        return documentSplitFound;
      }
    }

    if (splitContent.length === 2 && onlyTitle) {
      const string01 = splitContent[0].trim();
      const string02 = splitContent[1].replace(/ \(RESTRITO\)/, '').trim();

      const documentSplitFound = documents.find(
        (doc) =>
          (doc.titulo.match(string01) || doc.titulo.match(string02)) &&
          doc.data === targetMoviment.data,
      );

      if (documentSplitFound) {
        console.log('documentSplitFound: ', documentSplitFound);
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
  } catch (error) {
    console.error('Erro ao processar documentos:', error);
    return null;
  }
}

function getListDocumentByContent(
  contentRegex: RegExp,
  moviments: any[],
  documents: any[],
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
        const string01 = splitContent[0].trim();
        const string02 = splitContent[1].replace(/ \(RESTRITO\)/, '').trim();

        const documentSplitFounds = documents.find(
          (doc) =>
            (doc.titulo.match(string02) || doc.descricao.match(string01)) &&
            doc.data === targetMoviment.data,
        );

        if (documentSplitFounds?.length) {
          console.log('documentSplitFound: ', documentSplitFounds);
          return documentSplitFounds;
        }
      }

      const documentFound = documents.find(
        (doc) =>
          (normalizeString(doc.titulo).match(contentRegex) ||
            normalizeString(doc.descricao).match(contentRegex)) &&
          doc.data === targetMoviment.data,
      );

      documentFounds.push(documentFound);
    }

    return documentFounds || null;
  } catch (error) {
    console.error('Erro ao processar documentos:', error);
    return null;
  }
}

export default getDocumentByContent;

export { getListDocumentByContent };
