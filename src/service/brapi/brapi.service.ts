import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class BrapiService {
  private readonly logger = new Logger(BrapiService.name);
  private axiosApi: AxiosInstance;

  constructor() {
    this.axiosApi = axios.create({
      baseURL: process.env.BRAPI_URL,
      params: {
        token: process.env.BRAPI_TOKEN,
        country: 'brazil',
      }
    });
  }

  async getCurrentSelicRate() {
    try {
      const response = await this.axiosApi.get('/prime-rate');
      this.logger.debug(`BRAPI response: ${JSON.stringify(response?.data)}`);
      const value = Number(response?.data['prime-rate'][0]?.value);
      if (!value) {
        throw new Error('Error getting current Selic rate');
      }
      return value;
    } catch (error) {
      this.logger.error(`Error getting current Selic rate: ${error instanceof Error ? error.stack : String(error)}`);
      throw new Error('Error getting current Selic rate');
    }
  }
}
