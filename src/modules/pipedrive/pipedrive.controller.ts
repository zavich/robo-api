import { ApiKeyAuthGuard } from "../authentication/guards/apikey-auth.guard";
import { AddNoteDto } from "./dto/add-note.dto";
import { AddNoteService } from "./services/add-notes.service";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";

@Controller('pipedrive')
@UseGuards(ApiKeyAuthGuard)
export class PipedriveController {
  constructor(
    private readonly addNoteService: AddNoteService,
  ) { }

  @Post('add-note')
  async addNote(@Body() body: AddNoteDto) {
    return this.addNoteService.addNote({ content: body.content, dealId: body.dealId });
  }
}