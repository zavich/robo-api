import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { DocumentService } from './services/document.service';
import { FindCompanyService } from './services/find-company.service';
import { ListCompanyService } from './services/list-company.service';
import { UpdateCompanyService } from './services/update.service';
import { UploadXLSXCompanyService } from './services/upload-xlsx.service';
import { WebhookService } from './services/webhook.service';

@Controller('company')
export class CompanyController {
  constructor(
    private readonly listCompanyService: ListCompanyService,
    private readonly findCompanyService: FindCompanyService,
    private readonly uploadXLSXCompanyService: UploadXLSXCompanyService,
    private readonly webhookService: WebhookService,
    private readonly documentService: DocumentService,
    private readonly updateCompanyService: UpdateCompanyService,
  ) {}
  @Post('upload-xml')
  async atualizarSolvencia() {
    return this.uploadXLSXCompanyService.execute();
  }
  @Get(':cnpj')
  @UseGuards(ApiKeyAuthGuard)
  async findOne(@Param('cnpj') cnpj: string) {
    return this.findCompanyService.execute(cnpj);
  }
  @Get()
  @UseGuards(ApiKeyAuthGuard)
  async findAll(@Query() query: any) {
    return this.listCompanyService.execute(query);
  }
  @Post('document')
  @UseGuards(ApiKeyAuthGuard)
  async findAllDocuments(
    @Query('cnpj') cnpj: string,
    @Query('type') type: string,
  ) {
    this.documentService.execute(cnpj, type);
    return { message: 'Documento solicitado com sucesso' };
  }
  @Put(':id')
  @UseGuards(ApiKeyAuthGuard)
  async update(@Param('id') id: number, @Body() updateData: any) {
    return this.updateCompanyService.execute(id, updateData);
  }
  @Post('webhook')
  async handleWebhook(@Body() payload: any, @Query('type') type: string) {
    this.webhookService.execute(payload, type);
  }
}
