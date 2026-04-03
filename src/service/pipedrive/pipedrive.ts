import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
// Update the path below to the correct location of process.schema.ts
import { Model } from 'mongoose';
import {
  AutosData,
  PeticaoInicialData,
  RestrictedDocumentType,
} from 'src/modules/process/interfaces/process.interface';
import {
  Process,
  ProcessDocumentType,
} from '../../modules/process/schema/process.schema';
@Injectable()
export default class PipedriveService {
  private readonly logger = new Logger();
  constructor(
    @InjectModel(Process.name) private readonly processModel: Model<Process>,
  ) {}

  async updateApprovedLawsuit(
    reclamante: string,
    reclamada: string,
    dealId: number,
    status?,
    lostReason?,
    stage = false,
  ) {
    try {
      const findProcessByDealId = await this.processModel.findOne({
        dealId,
      });
      let lawsuit;
      if (findProcessByDealId?.class === 'MAIN') {
        lawsuit = await this.processModel.findOne({
          number: findProcessByDealId?.calledByProvisionalLawsuitNumber,
        });
      } else {
        lawsuit = await this.processModel.findOne({
          calledByProvisionalLawsuitNumber: findProcessByDealId?.number,
        });
      }
      const body = {
        stage_id: stage ? 696 : undefined,
        title: `${reclamante} X ${reclamada}`,
        ...(status === 'lost' && {
          status: 'lost',
          lost_reason: lostReason,
        }),
        ...(!status && {
          de696f45d23c41be28892dcf4d83383852946429: 'Sim',
        }),
      };
      const planilhasCalc =
        findProcessByDealId?.class === 'MAIN'
          ? findProcessByDealId?.documents.filter(
              (doc: any) => doc.type === ProcessDocumentType.PlanilhaCalculo,
            )
          : (lawsuit?.documents as unknown as RestrictedDocumentType[])?.filter(
              (doc) => doc.type === ProcessDocumentType.PlanilhaCalculo,
            );
      const peticaoData =
        findProcessByDealId?.class === 'MAIN'
          ? ((
              findProcessByDealId?.documents as unknown as RestrictedDocumentType[]
            ).find((doc) => doc.type === 'PeticaoInicial')
              ?.data as PeticaoInicialData)
          : ((lawsuit?.documents as unknown as RestrictedDocumentType[])?.find(
              (doc) => doc.type === 'PeticaoInicial',
            )?.data as PeticaoInicialData);
      const homologadoCalc =
        findProcessByDealId?.class === 'MAIN'
          ? ((
              findProcessByDealId?.documents as unknown as RestrictedDocumentType[]
            ).find(
              (doc) => doc.type === ProcessDocumentType.HomologacaoDeCalculo,
            )?.data as any)
          : ((lawsuit?.documents as unknown as RestrictedDocumentType[])?.find(
              (doc) => doc.type === ProcessDocumentType.HomologacaoDeCalculo,
            )?.data as any);
      interface AcordaoData {
        hipotese?: string;
        [key: string]: any;
      }
      const acordao =
        findProcessByDealId?.class === 'MAIN'
          ? (
              findProcessByDealId.documents as unknown as RestrictedDocumentType[]
            ).find(
              (doc) =>
                doc.type === ProcessDocumentType.Acordao &&
                doc.title === 'Acórdão',
            )
          : (lawsuit?.documents as unknown as RestrictedDocumentType[])?.find(
              (doc) =>
                doc.type === ProcessDocumentType.Acordao &&
                doc.title === 'Acórdão',
            );

      const acordaoData = acordao?.data as AcordaoData | undefined;
      const ultimaMovimentacao = this.pegarUltimaAtualizacao(
        findProcessByDealId.moviments,
      );
      const parcelasDeferidas =
        findProcessByDealId?.class === 'MAIN'
          ? (
              findProcessByDealId.documents as unknown as RestrictedDocumentType[]
            ).find((doc) => doc.type === ProcessDocumentType.SentencaMerito)
          : (lawsuit?.documents as unknown as RestrictedDocumentType[])?.find(
              (doc) => doc.type === ProcessDocumentType.SentencaMerito,
            );
      const datasUnicas = new Set();
      const acordaoRecursos =
        findProcessByDealId?.class === 'MAIN'
          ? (
              findProcessByDealId.documents as unknown as RestrictedDocumentType[]
            )
              .filter((doc) => doc.type === ProcessDocumentType.AcordaoTRT)
              .filter((doc) => {
                if (datasUnicas.has(doc.date)) return false;
                datasUnicas.add(doc.date);
                return true;
              })
              .flatMap((doc) =>
                doc.data && 'recursos' in doc.data
                  ? ((doc.data as { recursos?: any[] }).recursos ?? [])
                  : [],
              )
              .filter((recurso) => recurso.provido)
          : (lawsuit?.documents as unknown as RestrictedDocumentType[])
              ?.filter((doc) => doc.type === ProcessDocumentType.AcordaoTRT)
              .filter((doc) => {
                if (datasUnicas.has(doc.date)) return false;
                datasUnicas.add(doc.date);
                return true;
              })
              .flatMap((doc) =>
                doc.data && 'recursos' in doc.data
                  ? ((doc.data as { recursos?: any[] }).recursos ?? [])
                  : [],
              )
              .filter((recurso) => recurso.provido);

      const conclusao =
        acordaoRecursos?.length > 0
          ? acordaoRecursos
              .map((recurso, index) => {
                const materias =
                  recurso.materias?.map((m) => m.name).join(', ') ||
                  'Não informado';
                return `Recurso ${index + 1}:
- Tipo: ${recurso.name}
- Parte: ${recurso.parte}
- Conhecido: ${recurso.conhecido ? 'Sim' : 'Não'}
- Provido: ${recurso.provido ? 'Sim' : 'Não'}
- Matérias: ${materias}`;
              })
              .join('\n\n')
          : 'Não identificado';
      const homologadoOwner = homologadoCalc?.calculoOwner;

      const calculoHomologadoPorOwner = `
      \n\nCálculo do Reclamante:
      ${this.calcularTotaisPorOwner(planilhasCalc, 'reclamante')}

      \n\nCálculo da Reclamada:
      ${this.calcularTotaisPorOwner(planilhasCalc, 'reclamada')}

      \n\nCálculo do Perito:
      ${this.calcularTotaisPorOwner(planilhasCalc, 'perito')}

      \n\nCálculo Homologado ${homologadoOwner || ''}:
      ${homologadoOwner ? this.calcularTotaisPorOwner(planilhasCalc, homologadoOwner) : 'Não identificado'}
`;

      const bodyNote = {
        content: `
        Pro Solutti\n\nInformações do Processo
        \n\nAjuizamento:${findProcessByDealId?.instancias[0]?.data_distribuicao || 'Não identificado'}
        \n\nValor da causa:${peticaoData?.valor_causa || 'Não identificado'}
        \n\nVínculo:${peticaoData?.dados_contrato?.funcao_exercida || 'Não identificado'}
        \n\nSalário:${peticaoData?.dados_contrato?.ultimo_salario || 'Não identificado'}
        \n\Parcelas deferidas na sentença: ${(parcelasDeferidas?.data as { resumoCondenacao?: string })?.resumoCondenacao || 'Não identificado'}
        \n\nÚltima movimentação: ${ultimaMovimentacao ? `${ultimaMovimentacao?.conteudo} em ${ultimaMovimentacao?.data}` : 'Não identificado'}
        \n\nConclusão do Acórdão:\n ${conclusao || 'Não identificado'}
        \n\nTrânsito em julgado: ${(findProcessByDealId?.autosData as unknown as AutosData)?.dateOfTransit ? 'Sim' : 'Não'}
        \n\n${findProcessByDealId.class === 'MAIN' ? 'Execução Provisória' : 'Processo Principal'}: ${findProcessByDealId?.class === 'MAIN' ? lawsuit?.calledByProvisionalLawsuitNumber || 'Não identificado' : lawsuit?.number || 'Não identificado'}
        ${
          acordaoData
            ? `\n\nAcórdão ${
                acordaoData.hipotese === 'AUMENTO'
                  ? 'majorou'
                  : acordaoData.hipotese?.toLocaleLowerCase() === 'diminuição'
                    ? 'diminuiu'
                    : acordaoData.hipotese?.toLocaleLowerCase()
              } a sentença ${
                acordaoData.hipotese === 'REARBITRAMENTO' ? 'em' : 'para'
              }: ${acordaoData.valor_condenacao || 'Não identificado'}`
            : ''
        }
        ${calculoHomologadoPorOwner}`,
      };
      const requestUrl = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/deals/${dealId}`;
      const requestUrlNote = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/notes`;

      const response = await axios.put(requestUrl, body, {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          api_token: process.env.PIPEDRIVE_PROSOLUTTI_TOKEN,
        },
      });
      if (!status) {
        if (findProcessByDealId.noteId || lawsuit?.noteId) {
          await axios.put(
            `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/notes/${findProcessByDealId.noteId || lawsuit?.noteId}`,
            bodyNote,
            {
              headers: {
                'Content-Type': 'application/json',
              },
              params: {
                api_token: process.env.PIPEDRIVE_PROSOLUTTI_TOKEN,
              },
            },
          );
        } else {
          const responseNote = await axios.post(
            requestUrlNote,
            { ...bodyNote, deal_id: dealId },
            {
              headers: {
                'Content-Type': 'application/json',
              },
              params: {
                api_token: process.env.PIPEDRIVE_PROSOLUTTI_TOKEN,
              },
            },
          );
          await this.processModel.updateOne(
            { dealId },
            { noteId: responseNote.data.data.id },
          );
        }
      }

      return response.data;
    } catch (error) {
      console.log(`Error updating Pipedrive deal: ${error}`);

      if (error?.response?.status === 429 || error?.response?.status === 403) {
        this.logger.warn(
          `Pipedrive API rate limit exceeded. Retrying in 3 seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return this.updateApprovedLawsuit(reclamante, reclamada, dealId, stage);
      }
      this.logger.error(
        `ERROR PIPEDRIVE SERVICE: ${JSON.stringify(error?.response?.data, null, 2)}`,
      );
    }
  }
  pegarUltimaAtualizacao(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;

    return arr.reduce((maisRecente, atual) => {
      const parseData = (str) => {
        const [dia, mes, ano] = str.split('/').map(Number);
        return new Date(ano, mes - 1, dia); // mês zero-based
      };

      if (!maisRecente) return atual;

      const dataMaisRecente = parseData(maisRecente.data);
      const dataAtual = parseData(atual.data);

      return dataAtual > dataMaisRecente ? atual : maisRecente;
    }, null);
  }
  calcularTotaisPorOwner(planilhasCalc: any[], owner: string) {
    const docs = planilhasCalc?.filter((doc) => doc?.data?.ownerType === owner);
    if (docs?.length === 0) return 'Não identificado';

    const bruto = docs
      ?.reduce((acc, doc) => acc + (doc?.data?.bruto || 0), 0)
      .toFixed(2);
    const liquido = docs
      ?.reduce((acc, doc) => acc + (doc?.data?.liquido || 0), 0)
      .toFixed(2);
    const fgts = docs
      ?.reduce((acc, doc) => acc + (doc?.data?.fgts || 0), 0)
      .toFixed(2);

    return `bruto: ${bruto}\nliquido: ${liquido}\nFGTS: ${fgts}`;
  }
}
