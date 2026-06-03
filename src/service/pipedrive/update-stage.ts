import axios from 'axios';

interface UpdatePipedrive {
  dealId?: number;
  stageId?: number;
  lostReason?: string;
  status?: 'open' | 'lost';
  data?: Record<string, unknown>;
}

export async function updateStageToPipedrive({
  stageId,
  dealId,
  lostReason,
  status = 'open',
  data = {},
}: UpdatePipedrive): Promise<Record<string, unknown>> {
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
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(
      `Failed to update stage in Pipedrive: ${axiosError.response?.data?.error || axiosError.message}`,
    );
  }
}
