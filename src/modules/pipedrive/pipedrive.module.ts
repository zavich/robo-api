import { Module } from '@nestjs/common';
import { PipedriveController } from './pipedrive.controller';
import { AddNoteService } from './services/add-notes.service';

@Module({
  imports: [
  ],
  controllers: [PipedriveController],
  providers: [
    AddNoteService
  ],
  exports: [],
})
export class PipedriveModule { }
