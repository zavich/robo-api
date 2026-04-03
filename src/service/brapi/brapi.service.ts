import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class BrapiService {
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
      console.log('REPONSE BRAPI: ', response?.data);
      const value = Number(response?.data['prime-rate'][0]?.value);
      if (!value) {
        throw new Error('Error getting current Selic rate');
      }
      return value;
    } catch (error) {
      console.error('Error getting current Selic rate: ', error);
      throw new Error('Error getting current Selic rate');
    }
  }
}
