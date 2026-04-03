import axios from 'axios';

interface UpdatePipedriveCustomField {
  dealId: number;
  fieldKey: string;
  fieldValue: any;
}

export async function updatePipedriveCustomField({
  dealId,
  fieldKey,
  fieldValue,
}: UpdatePipedriveCustomField): Promise<any> {
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
  } catch (error: any) {
    throw new Error(
      `Failed to update Pipedrive custom field: ${error.response?.data?.error || error.message}`,
    );
  }
}
