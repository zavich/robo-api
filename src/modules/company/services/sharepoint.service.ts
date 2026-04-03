import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SharePointService {
  private readonly logger = new Logger(SharePointService.name);

  private readonly siteId = process.env.MICROSOFT_SITE_ID;

  private readonly driveId = process.env.MICROSOFT_DRIVE_ID;

  private readonly itemId = process.env.MICROSOFT_ITEM_ID;

  async getAccessToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
    params.append('client_secret', process.env.MICROSOFT_SECRET_VALUE);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_DIRECTORY_ID}/oauth2/v2.0/token`,
      params,
    );

    return response.data.access_token;
  }

  async downloadSolvenciaXLSX(): Promise<Buffer> {
    const token = await this.getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/sites/${this.siteId}/drives/${this.driveId}/items/${this.itemId}/content`;

    this.logger.log('Baixando PLANILHA SOLVÊNCIA.xlsx do SharePoint...');

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` },
    });

    return Buffer.from(response.data);
  }
}
