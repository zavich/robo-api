import { Injectable } from "@nestjs/common";

export interface RejectionReasonOption {
	key: string;
	label: string;
	isCustom?: boolean;
	createdAt?: Date;
}

export interface LossReasonCategory {
	category: string;
	reasons: RejectionReasonOption[];
}

@Injectable()
export class LossReasonsService {
	execute(): RejectionReasonOption[] {
		return [
			{ key: 'ARQUIVADO', label: 'PRÉ-ANÁLISE – ARQUIVADO' },
			{ key: 'CLASSE_INELEGIVEL', label: 'PRÉ-ANÁLISE – CLASSE INELEGÍVEL' },
			{
				key: 'LISTA_EMPRESA_INELEGIVEL',
				label: 'PRÉ-ANÁLISE – LISTA DE EMPRESA INELEGÍVEL',
			},
			{ key: 'NAO_E_TRABALHISTA', label: 'PRÉ-ANÁLISE – NÃO É TRABALHISTA' },
			{ key: 'PROCESSO_FISICO', label: 'PRÉ-ANÁLISE – PROCESSO FÍSICO' },
			{ key: 'SEGREDO_JUSTICA', label: 'PRÉ-ANÁLISE – SEGREDO DE JUSTIÇA' },
			{ key: 'SEM_ACORDAO', label: 'PRÉ-ANÁLISE – SEM ACÓRDÃO' },
			{ key: 'PRE_ANALISE_IMPROCEDENTE', label: 'PRÉ-ANÁLISE – IMPROCEDENTE' },
			{ key: 'PRE_ANALISE_ACORDO', label: 'PRÉ-ANÁLISE – ACORDO' },
			{ key: 'PRE_ANALISE_VALOR_ABAIXO_MINIMO', label: 'PRÉ-ANÁLISE – VALOR ABAIXO DO MÍNIMO' },
			{ key: 'PRE_ANALISE_LIQUIDADO', label: 'PRÉ-ANÁLISE – LIQUIDADO' },
			{ key: 'PRE_ANALISE_SUSPENSO', label: 'PRÉ-ANÁLISE – SUSPENSO' },
			{ key: 'PRE_ANALISE_CCB_CESSAO_CREDITO', label: 'PRÉ-ANÁLISE – CLIENTE FEZ CCB OU CESSAO DE CREDITO' },
			{ key: 'AGUARDAR_TRANSITO', label: 'ANÁLISE – AGUARDAR TRÂNSITO' },
			{
				key: 'TRT_INACESSIVEL',
				label:
					'ANÁLISE - FALHA AO TENTAR ACESSAR INFORMAÇÕES, TENTE NOVAMENTE MAIS TARDE',
			},
			{
				key: 'AGUARDAR_DECISAO_TST',
				label: 'ANÁLISE – AGUARDAR DECISÃO DO TST',
			},
			{ key: 'ABAIXO_VALOR_MINIMO', label: 'ANÁLISE – ABAIXO DO VALOR MÍNIMO' },
			{ key: 'ANALISE_IMPROCEDENTE', label: 'ANÁLISE – IMPROCEDENTE' },
			{ key: 'LIQUIDADO', label: 'ANÁLISE – LIQUIDADO' },
			{ key: 'RISCO_TESE', label: 'ANÁLISE – RISCO DE TESE' },
			{ key: 'RISCO_PRAZO', label: 'ANÁLISE – RISCO DE PRAZO' },
			{
				key: 'RISCO_TESE_PENDENTE_TRANSITO',
				label: 'ANÁLISE – RISCO DE TESE – PENDENTE TRÂNSITO EM JULGADO',
			},
			{
				key: 'PROCESSO_PRINCIPAL_ARQUIVADO_SEM_PROVISORIA',
				label:
					'ANÁLISE – PROCESSO PRINCIPAL ARQUIVADO E NÃO EXISTE EXECUÇÃO PROVISÓRIA',
			},
			{
				key: 'EXECUCAO_PROVISORIA_ARQUIVADO_SEM_PRINCIPAL',
				label:
					'ANÁLISE – EXECUÇÃO PROVISÓRIA ARQUIVADO E NÃO EXISTE PROCESSO PRINCIPAL',
			},
			{
				key: 'PROCESSOS_ARQUIVADOS',
				label: 'ANÁLISE – EXECUÇÃO PROVISÓRIA E PROCESSO PRINCIPAL ARQUIVADOS',
			},
			{ key: 'PROCESSO_SEM_CREDITO', label: 'ANÁLISE – PROCESSO SEM CREDITO' },
		];
	}

	/**
	 * Retorna os motivos de perda organizados por categoria
	 */
	getByCategory(): LossReasonCategory[] {
		const allReasons = this.execute();

		const preAnaliseReasons = allReasons.filter(reason => 
			reason.label.startsWith('PRÉ-ANÁLISE')
		);

		const analiseReasons = allReasons.filter(reason => 
			reason.label.startsWith('ANÁLISE')
		);

		return [
			{
				category: 'PRÉ-ANÁLISE',
				reasons: preAnaliseReasons
			},
			{
				category: 'ANÁLISE',
				reasons: analiseReasons
			}
		];
	}

	/**
	 * Busca motivos de perda por texto
	 */
	search(searchTerm: string): RejectionReasonOption[] {
		if (!searchTerm || searchTerm.trim() === '') {
			return this.execute();
		}

		const term = searchTerm.toLowerCase();
		return this.execute().filter(reason =>
			reason.key.toLowerCase().includes(term) ||
			reason.label.toLowerCase().includes(term)
		);
	}
}