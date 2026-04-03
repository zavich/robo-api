import axios from 'axios';

interface AddNoteParams {
  content: string;
  dealId?: number;
}

export async function addNoteToPipedrive({
  content,
  dealId,
}: AddNoteParams): Promise<any> {
  const url = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/notes`;
  const data: Record<string, any> = { content };

  if (dealId) data.deal_id = dealId;

  try {
    const response = await axios.post(
      url,
      { ...data, deal_id: dealId },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          api_token: process.env.PIPEDRIVE_PROSOLUTTI_TOKEN,
        },
      },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to add note to Pipedrive: ${error.response?.data?.error || error.message}`,
    );
  }
}
