import axios from 'axios';

interface UpdateActivityParams {
  dealId: number;
  subject?: string;
  note?: string;
  type?: string;
  done?: boolean;
  activityId: number;
  dueDate?: string;
  dueTime?: string;
}

export async function findActivityByDealId(
  dealId: number,
  type?: string,
  subject?: string,
): Promise<number | null> {
  const baseUrl = process.env.PIPEDRIVE_PROSOLUTTI_URL;
  const hasApiSegment = /\/api($|\/)/.test(baseUrl);
  const normalizedBase = hasApiSegment ? baseUrl : `${baseUrl}/api`;
  const activitiesUrl = `${normalizedBase}/v2/activities`;

  const params: Record<string, any> = {
    deal_id: dealId,
    limit: 100,
  };

  const apiToken = process.env.PIPEDRIVE_PROSOLUTTI_TOKEN;
  if (!apiToken) {
    throw new Error('Missing PIPEDRIVE_PROSOLUTTI_TOKEN environment variable');
  }

  try {
    const response = await axios.get(activitiesUrl, {
      params,
      headers: {
        Accept: 'application/json',
        'X-API-Token': apiToken,
      },
    });

    const activities = response.data?.data || [];

    if (activities.length === 0) {
      console.log(`[findActivityByDealId] Nenhuma atividade encontrada para dealId: ${dealId}, type: ${type}, subject: ${subject}`);
      return null;
    }

    let filteredActivities = activities;

    if (type && type.trim() !== '') {
      filteredActivities = filteredActivities.filter((activity: any) =>
        activity.type === type.trim()
      );
    }

    if (subject && subject.trim() !== '') {
      const subjectLower = subject.trim().toLowerCase();
      filteredActivities = filteredActivities.filter((activity: any) =>
        activity.subject && activity.subject.toLowerCase().includes(subjectLower)
      );
    }

    if (filteredActivities.length > 0) {
      const mostRecent = filteredActivities[0];
      const foundId = mostRecent.id;
      return foundId;
    }

    return null;
  } catch (error: any) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      return null;
    }
    throw new Error(
      `Failed to find activity in Pipedrive: ${error.response?.data?.error || error.message}`,
    );
  }
}

export async function updateActivity({
  dealId,
  subject,
  note,
  type,
  done = false,
  activityId,
  dueDate,
  dueTime,
}: UpdateActivityParams): Promise<any> {
  const baseUrl = process.env.PIPEDRIVE_PROSOLUTTI_URL;
  const hasApiSegment = /\/api($|\/)/.test(baseUrl);
  const normalizedBase = hasApiSegment ? baseUrl : `${baseUrl}/api`;
  const activitiesUrl = `${normalizedBase}/v2/activities`;

  const body: Record<string, any> = {
    deal_id: dealId,
    done: done ? 1 : 0,
  };

  if (subject) {
    body.subject = subject;
  }

  if (note) {
    body.note = note;
  }

  if (dueDate) {
    body.due_date = dueDate;
  }

  if (dueTime) {
    body.due_time = dueTime;
  }

  const apiToken = process.env.PIPEDRIVE_PROSOLUTTI_TOKEN;
  if (!apiToken) {
    throw new Error('Missing PIPEDRIVE_PROSOLUTTI_TOKEN environment variable');
  }

  try {
    const url = `${activitiesUrl}/${activityId}`;
    const response = await axios.patch(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Token': apiToken,
      },
    });

    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to update activity in Pipedrive: ${error.response?.data?.error || error.message}`,
    );
  }
}

