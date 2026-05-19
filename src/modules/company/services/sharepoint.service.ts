import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SharePointService {
  private readonly logger = new Logger(SharePointService.name);

  private readonly siteId = process.env.MICROSOFT_SITE_ID;

  private readonly driveId = process.env.MICROSOFT_DRIVE_ID;

  private readonly itemId = process.env.MICROSOFT_ITEM_ID;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Reutiliza token enquanto tiver mais de 60s de validade
    if (this.cachedToken && now < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }

    const params = new URLSearchParams();
    params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
    params.append('client_secret', process.env.MICROSOFT_SECRET_VALUE);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_DIRECTORY_ID}/oauth2/v2.0/token`,
      params,
    );

    this.cachedToken = response.data.access_token as string;
    const expiresIn: number = (response.data.expires_in ?? 3600) * 1000;
    this.tokenExpiresAt = now + expiresIn;

    return this.cachedToken;
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
