import axios from 'axios';

interface UpdatePipedrive {
  dealId?: number;
  stageId?: number;
  lostReason?: string;
  status?: 'open' | 'lost';
  data?: any;
}

export async function updateStageToPipedrive({
  stageId,
  dealId,
  lostReason,
  status = 'open',
  data = {},
}: UpdatePipedrive): Promise<any> {
  const url = `${process.env.PIPEDRIVE_PROSOLUTTI_URL}/v1/deals/${dealId}`;
  const body = {
    stage_id: stageId,
    status,
    ...data,
    ...(status === 'lost' && {
      lost_reason: lostReason,
    }),
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
      `Failed to add note to Pipedrive: ${error.response?.data?.error || error.message}`,
    );
  }
}
