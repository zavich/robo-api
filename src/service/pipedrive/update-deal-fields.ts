import axios from 'axios';

interface UpdateDealFields {
  dealId: number;
  data: Record<string, unknown>;
}

/**
 * Atualiza apenas os campos customizados do deal no Pipedrive
 * SEM alterar o stage_id (não move o deal na esteira)
 */
export async function updateDealFields({
  dealId,
  data = {},
}: UpdateDealFields): Promise<Record<string, unknown>> {
  const url = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/deals/${dealId}`;
  
  // Envia APENAS os campos customizados, sem stage_id
  const body = {
    ...data,
  };

  try {
    const response = await axios.put(url, body, {
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        api_token: process.env.PIPEDRIVE_PROSOLUTTI_TOKEN,
      },
    });

    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(
      `Failed to update deal fields in Pipedrive: ${axiosError.response?.data?.error || axiosError.message}`,
    );
  }
}

