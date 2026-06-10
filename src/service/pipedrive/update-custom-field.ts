import axios from 'axios';

interface UpdatePipedriveCustomField {
  dealId: number;
  fieldKey: string;
  fieldValue: string | number | boolean | null;
}

export async function updatePipedriveCustomField({
  dealId,
  fieldKey,
  fieldValue,
}: UpdatePipedriveCustomField): Promise<Record<string, unknown>> {
  const url = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/deals/${dealId}`;
  const body = {
    [fieldKey]: fieldValue,
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
      `Failed to update Pipedrive custom field: ${axiosError.response?.data?.error || axiosError.message}`,
    );
  }
}
